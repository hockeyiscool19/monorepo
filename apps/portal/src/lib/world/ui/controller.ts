// The world's composition root and conductor. It picks one adapter per port (Firebase or no sign-in, the
// HTTP door, localStorage or Firestore for the board), builds the engine, and turns what happens in the
// world (E on a gate, a portal crossed, a card completed) into use cases and interface state.

import { GETAWAY, gateState, guildNames, sealMessage, spaceState, type AccessContext, type RealmMode } from '../domain/access';
import { gatePlaceName, GUARD_LINES, lineAt, LOADING_TIPS, PLACE_NAMES } from '../domain/lore';
import { realmMode } from '../domain/mode';
import { layoutRealm, type RealmData, type RealmGate, type RealmLayout } from '../domain/realm';
import type { AuthPort } from '../application/ports';
import { closeAllDoors, enterGate } from '../application/travel';
import { createFirebaseRuntime, unavailableAuth, type FirebaseRuntime } from '../adapters/firebaseAuth';
import { resolveFirebase } from '../adapters/firebaseConfig';
import { HttpDoor } from '../adapters/httpDoor';
import type { Engine, HudFrame } from '../engine/Engine';
import type { GateLook, Interactable } from '../engine/space';
import { BoardController } from './boardController';
import { loadDiscovered, prefersReducedMotion, saveDiscovered, saveSettings, type Overlay, type Settings, type WorldUi } from './state.svelte';

export class WorldController {
	readonly mode: RealmMode;
	readonly layout: RealmLayout;
	private auth: AuthPort = unavailableAuth();
	private firebase: FirebaseRuntime | null = null;
	private readonly door = new HttpDoor((input, init) => fetch(input, init));
	private engine: Engine | null = null;
	readonly board: BoardController;
	private guardLine = 0;
	private readonly discovered = new Set(loadDiscovered());
	private previousOverlay: Overlay = null;

	constructor(
		readonly realm: RealmData,
		readonly ui: WorldUi,
		location: { hostname: string; search: string }
	) {
		this.mode = realmMode({ hostname: location.hostname, search: location.search, dev: import.meta.env.DEV, override: __REALM_MODE__ });
		this.layout = layoutRealm(realm.gates);
		this.board = new BoardController(ui, {
			mode: this.mode,
			access: () => this.access,
			firebase: () => this.firebase,
			onCards: (cards) => this.engine?.setBoard(cards),
			open: (overlay) => this.open(overlay),
			close: () => this.close()
		});
	}

	// ---- start-up -----------------------------------------------------------------------------------------

	/** Sign-in first (so the gates can be drawn sealed or open from the first frame), then the board. */
	async init(): Promise<void> {
		const projectId = this.realm.auth?.projectId;
		const setup = projectId ? await resolveFirebase(projectId, window.location, __FIREBASE_WEB__, (i, init) => fetch(i, init)) : null;
		if (setup) {
			try {
				this.firebase = await createFirebaseRuntime(setup);
				this.auth = this.firebase.auth;
			} catch {
				this.auth = unavailableAuth('Sign-in failed to load');
			}
		}
		this.ui.authAvailable = this.auth.available;
		this.ui.authLabel = this.auth.label;
		this.auth.subscribe((viewer) => {
			this.ui.viewer = viewer;
			this.ui.authReady = true;
			this.refreshGates();
			void this.board.connect();
		});
		void this.probeHealth();
	}

	get access(): AccessContext {
		return { mode: this.mode, viewer: this.ui.viewer, signInAvailable: this.auth.available };
	}

	/** Build the 3D world. The engine module (three.js) loads only now, after the title screen. */
	async begin(canvas: HTMLCanvasElement, surface: HTMLElement): Promise<void> {
		this.ui.phase = 'loading';
		this.ui.loadingLabel = 'Raising the gates…';
		try {
			const { Engine } = await import('../engine/Engine');
			const engine = await Engine.create({
				canvas,
				surface,
				realm: this.realm,
				layout: this.layout,
				settings: this.engineSettings(this.ui.settings),
				discovered: this.discovered,
				callbacks: {
					onHud: (frame: HudFrame) => (this.ui.hud = frame),
					onCommand: (command, target) => this.command(command, target),
					onPortal: (gateId) => void this.tryGate(gateId),
					onDiscover: (id) => this.discover(id),
					onPointerLock: (locked) => this.pointerLock(locked)
				}
			});
			this.engine = engine;
			engine.audio.start();
			engine.setSettings(this.engineSettings(this.ui.settings));
			this.refreshGates();
			engine.setBoard(this.ui.cards);
			engine.start();
			this.ui.phase = 'playing';
			this.followDeepLink();
			surface.focus();
		} catch (error) {
			this.ui.phase = 'failed';
			this.ui.failure = error instanceof Error ? error.message : 'The world could not be drawn on this device.';
		}
	}

	private followDeepLink(): void {
		const params = new URLSearchParams(window.location.search);
		const gateId = params.get('gate');
		const gate = gateId ? this.realm.gates.find((g) => g.id === gateId) : undefined;
		if (gate) {
			this.engine?.teleport(`gate:${gate.id}`);
			const reason = params.get('reason');
			const why =
				reason === 'session_expired'
					? 'Your pass through this gate expired.'
					: reason === 'door_unconfigured'
						? 'The gate’s door is not configured yet.'
						: 'The gate turned you away.';
			this.showNotice(gatePlaceName(gate.name), `${why} ${sealMessage(gateState(gate, this.access), gatePlaceName(gate.name), this.guilds)}`, true);
		}
		if (params.get('space') === 'getaway') this.enterGetaway();
	}

	private engineSettings(s: Settings) {
		return { quality: s.quality, reducedMotion: prefersReducedMotion(s), sensitivity: s.sensitivity, invertY: s.invertY, sound: s.sound, volume: s.volume };
	}

	get guilds() {
		return this.realm.auth?.groups ?? [];
	}

	// ---- the world talks ----------------------------------------------------------------------------------

	private command(command: 'interact' | 'map' | 'journal' | 'menu', target: Pick<Interactable, 'id' | 'kind'> | null): void {
		if (command === 'map') return this.open('map');
		if (command === 'journal') return this.open('journal');
		if (command === 'menu') return this.open('pause');
		if (!target) return;
		switch (target.kind) {
			case 'gate':
				return void this.tryGate(target.id.replace(/^gate:/, ''));
			case 'cabin-door':
				return this.enterGetaway();
			case 'exit-door':
				return this.leaveGetaway();
			case 'drawing-board':
				this.ui.editing = null;
				return this.open('drawing');
			case 'cork-board':
				return this.open('cork');
			case 'word-wall':
				return this.open('wordwall');
			case 'signpost':
				return this.open('map');
			case 'guard':
				return this.say('Hold guard', lineAt(GUARD_LINES, this.guardLine++));
			case 'campfire':
				return this.say('', 'You warm your hands by the fire. Your stamina returns.');
			case 'postcard':
				return this.say('', 'Greetings from Colorado: twin maroon peaks over a mirror lake, aspens gone to gold.');
		}
	}

	private say(speaker: string, text: string): void {
		this.ui.subtitle = { speaker, text };
		this.ui.announcement = speaker ? `${speaker}: ${text}` : text;
		const shown = this.ui.subtitle;
		setTimeout(() => {
			if (this.ui.subtitle === shown) this.ui.subtitle = null;
		}, 6500);
	}

	private discover(id: string): void {
		saveDiscovered(this.discovered.add(id));
		const gate = this.realm.gates.find((g) => `gate:${g.id}` === id);
		const title = gate ? gatePlaceName(gate.name) : id === 'cabin-door' ? PLACE_NAMES.cabin : id === 'word-wall' ? PLACE_NAMES.wordWall : PLACE_NAMES.campfire;
		this.ui.discovery = { title, subtitle: 'Discovered' };
		this.ui.announcement = `${title} discovered.`;
		setTimeout(() => (this.ui.discovery = null), 4200);
	}

	private pointerLock(locked: boolean): void {
		const wasLocked = this.ui.pointerLocked;
		this.ui.pointerLocked = locked;
		// Escape releases pointer lock before the page sees the key: treat that as "open the menu", like a game.
		if (wasLocked && !locked && this.ui.overlay === null && this.ui.phase === 'playing') this.open('pause');
	}

	/** What the prompt says for the thing in front of the player: `[E] Enter · Vale Gate`. */
	describe(target: Pick<Interactable, 'id' | 'kind'>): { verb: string; name: string; tone: 'go' | 'sealed' | 'plain' } {
		if (target.kind === 'gate') {
			const gate = this.realm.gates.find((g) => `gate:${g.id}` === target.id);
			if (!gate) return { verb: 'Enter', name: 'Gate', tone: 'plain' };
			const look = this.gateLook(gate);
			const name = gatePlaceName(gate.name);
			if (look === 'dormant') return { verb: 'Dormant', name, tone: 'sealed' };
			if (look === 'sealed') return { verb: 'Sealed', name, tone: 'sealed' };
			return { verb: look === 'unstable' ? 'Enter (unstable)' : 'Enter', name, tone: 'go' };
		}
		if (target.kind === 'cabin-door') {
			const open = spaceState(GETAWAY, this.access).kind === 'open';
			return { verb: open ? 'Enter' : 'Locked', name: GETAWAY.name, tone: open ? 'go' : 'sealed' };
		}
		const plain: Record<string, [string, string]> = {
			'exit-door': ['Leave', 'Back to Eisenhold'],
			'drawing-board': ['Use', 'Drawing board'],
			'cork-board': ['Read', 'Cork board'],
			'word-wall': ['Read', PLACE_NAMES.wordWall],
			guard: ['Talk', 'Hold guard'],
			signpost: ['Read', 'Signpost'],
			campfire: ['Rest', PLACE_NAMES.campfire],
			postcard: ['Look at', 'Postcard']
		};
		const [verb, name] = plain[target.kind] ?? ['Use', target.id];
		return { verb, name, tone: 'plain' };
	}

	/** The prompt button (touch, mouse) does what E does. */
	interact(): void {
		const target = this.ui.hud?.target ?? null;
		if (target) this.command('interact', target);
	}

	// ---- overlays -------------------------------------------------------------------------------------------

	open(overlay: Exclude<Overlay, null>): void {
		if (this.ui.overlay && overlay !== this.ui.overlay) this.previousOverlay = this.ui.overlay;
		this.ui.overlay = overlay;
		this.engine?.setPaused(true);
		this.engine?.audio.tick();
	}

	close(): void {
		const back = this.previousOverlay;
		this.previousOverlay = null;
		if (back && back !== this.ui.overlay && (back === 'cork' || back === 'journal' || back === 'map')) {
			this.ui.overlay = back;
			return;
		}
		this.ui.overlay = null;
		this.ui.notice = null;
		this.engine?.setPaused(false);
	}

	resume(): void {
		this.previousOverlay = null;
		this.ui.overlay = null;
		this.ui.notice = null;
		this.engine?.setPaused(false);
		this.engine?.requestPointerLock();
	}

	requestPointerLock(): void {
		this.engine?.requestPointerLock();
	}

	showNotice(title: string, message: string, signIn: boolean): void {
		this.ui.notice = { title, message, signIn: signIn && this.auth.available && !this.ui.viewer };
		this.open('notice');
	}

	// ---- gates and spaces -----------------------------------------------------------------------------------

	gateLook(gate: RealmGate): GateLook {
		const state = gateState(gate, this.access);
		if (state.kind !== 'open') return state.kind;
		return this.ui.health[gate.id] === 'down' ? 'unstable' : 'open';
	}

	refreshGates(): void {
		for (const gate of this.realm.gates) this.engine?.setGateLook(gate.id, this.gateLook(gate));
	}

	async tryGate(gateId: string): Promise<void> {
		const gate = this.realm.gates.find((g) => g.id === gateId);
		if (!gate || this.ui.travel) return;
		const place = gatePlaceName(gate.name);
		const outcome = await enterGate(gate, this.access, {
			auth: this.auth,
			door: this.door,
			navigator: {
				go: (href) => {
					this.ui.travel = { title: `Entering ${gate.name}`, tip: lineAt(LOADING_TIPS, Math.floor(Math.random() * LOADING_TIPS.length)) };
					this.engine?.setPaused(true);
					setTimeout(() => window.location.assign(href), 900);
				}
			}
		});
		if (outcome.kind === 'dormant') this.showNotice(place, `${place} is dormant: ${gate.name} has not been built yet.`, false);
		else if (outcome.kind === 'sealed') this.showNotice(place, sealMessage(outcome.state, place, this.guilds), true);
		else if (outcome.kind === 'refused') {
			const text: Record<typeof outcome.reason, string> = {
				sign_in_required: 'The door did not accept your sign-in. Sign in again, then return.',
				group_required: `The door checked your guilds and refused. Only the ${guildNames(gate.access?.groups ?? [], this.guilds)} may pass.`,
				session_expired: 'Your pass expired. Sign in again, then return.',
				door_unconfigured: 'This gate’s door is not configured on the gateway yet, so it stays shut (it fails closed).',
				unavailable: 'The gatehouse did not answer. Try again in a moment.'
			};
			this.showNotice(place, text[outcome.reason], outcome.reason === 'sign_in_required' || outcome.reason === 'session_expired');
		}
	}

	enterGetaway(): void {
		const state = spaceState(GETAWAY, this.access);
		if (state.kind !== 'open') {
			this.showNotice(GETAWAY.name, sealMessage(state, GETAWAY.name, this.guilds), true);
			return;
		}
		this.engine?.enterSpace('getaway', 'door');
		this.say('', 'My Get-a-way. The drawing board is by the window; the cork board holds every plan.');
	}

	leaveGetaway(): void {
		this.engine?.enterSpace('overworld', 'cabin');
	}

	fastTravel(spawn: string): void {
		if (this.engine?.currentSpace !== 'overworld') this.engine?.enterSpace('overworld', spawn);
		else this.engine?.teleport(spawn);
		this.resume();
	}

	private async probeHealth(): Promise<void> {
		try {
			const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(6000) : undefined;
			const res = await fetch(this.realm.healthUrl, { signal, cache: 'no-store', headers: { accept: 'application/json' } });
			const body = (await res.json()) as { apps?: { id: string; ok: boolean | null }[] };
			const health: Record<string, 'ok' | 'down' | 'unknown'> = {};
			for (const app of body.apps ?? []) health[app.id] = app.ok === true ? 'ok' : app.ok === false ? 'down' : 'unknown';
			this.ui.health = health;
			this.refreshGates();
		} catch {
			// Unknown health leaves every gate as the registry describes it.
		}
	}

	// ---- sign-in --------------------------------------------------------------------------------------------

	get authPort(): AuthPort {
		return this.auth;
	}

	async signOut(): Promise<void> {
		await closeAllDoors(this.realm.gates, this.door);
		await this.auth.signOut();
		this.ui.toast('Signed out. Every door session was closed.');
	}

	// ---- settings -------------------------------------------------------------------------------------------

	applySettings(next: Settings): void {
		const qualityChanged = next.quality !== this.ui.settings.quality;
		this.ui.settings = next;
		saveSettings(next);
		this.engine?.setSettings(this.engineSettings(next));
		if (qualityChanged) this.ui.toast('Graphics quality applies the next time Eisenhold loads.');
	}

	get audio() {
		return this.engine?.audio ?? null;
	}

	dispose(): void {
		this.board.dispose();
		this.engine?.dispose();
	}
}
