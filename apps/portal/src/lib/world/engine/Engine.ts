// The engine: one renderer, one camera, one player, and whichever space is current. It runs the frame loop,
// walks the player, picks the thing in front of them, fires portal crossings and discoveries, keeps the
// compass fed, and grades each frame (bloom → tone map → film grade). It decides nothing about access:
// the UI tells it how each gate looks.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Card } from '../domain/board';
import { bearing, headingOf, type RealmData, type RealmLayout } from '../domain/realm';
import { RealmAudio } from './audio';
import { buildGetaway } from './getaway/index';
import { Input, type Command } from './input';
import { buildOverworld } from './overworld/index';
import { Player } from './player';
import { gradeFragment, uvVertex } from './shaders';
import type { GateLook, Interactable, Quality, Space, SpaceId } from './space';
import { ensureFonts } from './textures/common';

export interface HudMarker {
	id: string;
	icon: string;
	label: string;
	bearing: number;
	distance: number;
}

export interface HudFrame {
	space: SpaceId;
	heading: number;
	markers: HudMarker[];
	target: Pick<Interactable, 'id' | 'kind'> | null;
	stamina: number;
}

export interface EngineSettings {
	quality: Quality;
	reducedMotion: boolean;
	sensitivity: number;
	invertY: boolean;
	sound: boolean;
	volume: number;
}

export interface EngineCallbacks {
	onHud(frame: HudFrame): void;
	onCommand(command: Command, target: Pick<Interactable, 'id' | 'kind'> | null): void;
	onPortal(gateId: string): void;
	onDiscover(markerId: string): void;
	onPointerLock(locked: boolean): void;
}

export interface EngineOptions {
	canvas: HTMLCanvasElement;
	/** The focusable element that owns keyboard and pointer input. */
	surface: HTMLElement;
	realm: RealmData;
	layout: RealmLayout;
	settings: EngineSettings;
	callbacks: EngineCallbacks;
	discovered: Iterable<string>;
}

const DISCOVER_RADIUS = 14;
const PIXEL_RATIO: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

export class Engine {
	readonly audio = new RealmAudio();
	private readonly renderer: THREE.WebGLRenderer;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly composer: EffectComposer;
	private readonly renderPass: RenderPass;
	private readonly bloom: UnrealBloomPass;
	private readonly grade: ShaderPass;
	private readonly input: Input;
	private readonly player = new Player();
	private readonly spaces = new Map<SpaceId, Space>();
	private space!: Space;
	private settings: EngineSettings;
	private readonly discovered: Set<string>;
	private readonly gateLooks = new Map<string, GateLook>();
	private cards: Card[] = [];
	private paused = false;
	private frame = 0;
	private running = false;
	private last = 0;
	private clock = 0;
	private lastTarget: string | null = null;
	private readonly resizeObserver: ResizeObserver;

	private constructor(private readonly opts: EngineOptions) {
		this.settings = opts.settings;
		this.discovered = new Set(opts.discovered);
		const ratio = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[this.settings.quality]);
		this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: this.settings.quality !== 'low', powerPreference: 'high-performance' });
		this.renderer.setPixelRatio(ratio);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.05;
		this.renderer.shadowMap.enabled = this.settings.quality !== 'low';
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
		this.composer = new EffectComposer(this.renderer);
		this.renderPass = new RenderPass(new THREE.Scene(), this.camera);
		this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.7);
		this.grade = new ShaderPass({
			uniforms: {
				tDiffuse: { value: null },
				uTime: { value: 0 },
				uGrain: { value: 0 },
				uVignette: { value: 0 },
				uLeak: { value: 0 },
				uAberration: { value: 0 },
				uSaturation: { value: 1 },
				uTint: { value: new THREE.Vector3(1, 1, 1) },
				uLift: { value: new THREE.Vector3(0, 0, 0) },
				uWeave: { value: 0 }
			},
			vertexShader: uvVertex,
			fragmentShader: gradeFragment
		});
		this.composer.addPass(this.renderPass);
		if (this.settings.quality !== 'low') this.composer.addPass(this.bloom);
		this.composer.addPass(new OutputPass());
		this.composer.addPass(this.grade);
		this.input = new Input(opts.surface, (command) => this.command(command), (locked) => opts.callbacks.onPointerLock(locked));
		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(opts.surface);
	}

	/** Build the renderer and the overworld. Fonts first, so the carved names are not in a fallback face. */
	static async create(opts: EngineOptions): Promise<Engine> {
		await ensureFonts();
		const engine = new Engine(opts);
		engine.spaces.set('overworld', buildOverworld(opts.realm, opts.layout, engine.buildContext()));
		engine.use('overworld', 'start');
		engine.resize();
		return engine;
	}

	private buildContext() {
		return {
			quality: this.settings.quality,
			pixelRatio: this.renderer.getPixelRatio(),
			reducedMotion: this.settings.reducedMotion,
			renderer: this.renderer
		};
	}

	private spaceFor(id: SpaceId): Space {
		let space = this.spaces.get(id);
		if (!space) {
			space = id === 'getaway' ? buildGetaway(this.buildContext()) : buildOverworld(this.opts.realm, this.opts.layout, this.buildContext());
			this.spaces.set(id, space);
			if (space.setGateLook) for (const [gate, look] of this.gateLooks) space.setGateLook(gate, look);
			space.setBoard?.(this.cards);
		}
		return space;
	}

	private use(id: SpaceId, spawn: string): void {
		this.space = this.spaceFor(id);
		const spot = this.space.spawns[spawn] ?? Object.values(this.space.spawns)[0];
		this.player.place(spot, this.space);
		this.renderPass.scene = this.space.scene;
		this.camera.fov = this.space.fov;
		this.camera.far = this.space.far;
		this.camera.updateProjectionMatrix();
		const { bloom, grade } = this.space;
		this.bloom.strength = bloom.strength;
		this.bloom.radius = bloom.radius;
		this.bloom.threshold = bloom.threshold;
		const u = this.grade.uniforms;
		u.uGrain.value = grade.grain;
		u.uVignette.value = grade.vignette;
		u.uLeak.value = grade.leak;
		u.uAberration.value = grade.aberration;
		u.uSaturation.value = grade.saturation;
		u.uTint.value.set(...grade.tint);
		u.uLift.value.set(...grade.lift);
		u.uWeave.value = this.settings.reducedMotion ? 0 : grade.weave;
		this.audio.silenceSources();
		this.audio.setBed(this.space.ambience);
		this.lastTarget = null;
	}

	/** Move to another space (the cabin door, the Get-a-way's exit) and stand at one of its spawns. */
	enterSpace(id: SpaceId, spawn: string): void {
		this.use(id, spawn);
		this.audio.door();
	}

	/** Fast travel within the current space. */
	teleport(spawn: string): void {
		const spot = this.space.spawns[spawn];
		if (spot) this.player.place(spot, this.space);
	}

	get currentSpace(): SpaceId {
		return this.space.id;
	}

	setGateLook(id: string, look: GateLook): void {
		this.gateLooks.set(id, look);
		this.spaces.get('overworld')?.setGateLook?.(id, look);
	}

	setBoard(cards: Card[]): void {
		this.cards = cards;
		this.spaces.get('getaway')?.setBoard?.(cards);
	}

	setSettings(next: Partial<EngineSettings>): void {
		this.settings = { ...this.settings, ...next };
		this.audio.setEnabled(this.settings.sound);
		this.audio.setVolume(this.settings.volume);
		this.grade.uniforms.uWeave.value = this.settings.reducedMotion ? 0 : this.space.grade.weave;
	}

	/** Menus open: the world keeps drawing behind them but the traveller stands still. */
	setPaused(paused: boolean): void {
		this.paused = paused;
		this.input.enabled = !paused;
		if (paused) {
			this.input.release();
			if (document.pointerLockElement === this.opts.surface) document.exitPointerLock();
		}
	}

	requestPointerLock(): void {
		this.input.requestPointerLock();
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.last = performance.now();
		const tick = (now: number) => {
			if (!this.running) return;
			requestAnimationFrame(tick);
			const dt = Math.min(0.05, (now - this.last) / 1000);
			this.last = now;
			this.step(dt);
		};
		requestAnimationFrame(tick);
	}

	stop(): void {
		this.running = false;
	}

	private command(command: Command): void {
		this.opts.callbacks.onCommand(command, command === 'interact' ? this.target() : null);
	}

	private target(): Pick<Interactable, 'id' | 'kind'> | null {
		const f = this.player.facing();
		let best: Interactable | null = null;
		let bestD = Infinity;
		for (const it of this.space.interactables) {
			const dx = it.x - this.player.x;
			const dz = it.z - this.player.z;
			const d = Math.hypot(dx, dz);
			if (d > it.radius || d >= bestD) continue;
			// Look roughly at it (within about 60°), unless you are practically touching it.
			const facing = d < 0.8 ? 1 : (dx * f.x + dz * f.z) / d;
			if (facing < 0.5) continue;
			best = it;
			bestD = d;
		}
		return best ? { id: best.id, kind: best.kind } : null;
	}

	private step(dt: number): void {
		// Reduced motion freezes the ambient clock: flames, portals, snow and aurora hold still; walking still works.
		if (!this.settings.reducedMotion) this.clock += dt;
		const t = this.clock;
		if (!this.paused) {
			const state = this.input.poll();
			const crossed = this.player.step(dt, state, this.input.consumeLook(), this.input.consumeJump(), this.space, this.settings);
			for (const id of crossed) this.opts.callbacks.onPortal(id.replace(/^gate:/, ''));
		}
		this.player.applyTo(this.camera, this.space.eyeHeight, this.settings.reducedMotion ? 0 : 1);
		this.space.update({ t, dt, player: { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.player.yaw }, camera: this.camera, reducedMotion: this.settings.reducedMotion });
		this.grade.uniforms.uTime.value = this.settings.reducedMotion ? 0 : t;
		this.composer.render(dt);
		this.frame++;

		for (const s of this.space.sounds) this.audio.setSource(s.key, s.kind, Math.hypot(s.x - this.player.x, s.z - this.player.z));
		if (this.space.id === 'overworld') {
			for (const m of this.space.markers) {
				if (this.discovered.has(m.id)) continue;
				if (Math.hypot(m.x - this.player.x, m.z - this.player.z) < DISCOVER_RADIUS) {
					this.discovered.add(m.id);
					this.audio.chime();
					this.opts.callbacks.onDiscover(m.id);
				}
			}
		}
		const target = this.target();
		const targetId = target?.id ?? null;
		if (this.frame % 2 === 0 || targetId !== this.lastTarget) {
			this.lastTarget = targetId;
			this.opts.callbacks.onHud({
				space: this.space.id,
				heading: headingOf(this.player.yaw),
				markers: this.space.markers.map((m) => ({
					id: m.id,
					icon: m.icon,
					label: m.label,
					bearing: bearing(this.player.x, this.player.z, m.x, m.z),
					distance: Math.hypot(m.x - this.player.x, m.z - this.player.z)
				})),
				target,
				stamina: this.player.stamina
			});
		}
	}

	private resize(): void {
		const { clientWidth: w, clientHeight: h } = this.opts.surface;
		if (w === 0 || h === 0) return;
		this.renderer.setSize(w, h, false);
		this.composer.setSize(w, h);
		this.bloom.resolution.set(w / 2, h / 2);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
	}

	dispose(): void {
		this.stop();
		this.resizeObserver.disconnect();
		this.input.dispose();
		for (const space of this.spaces.values()) space.dispose();
		this.composer.dispose();
		this.renderer.dispose();
		this.audio.dispose();
	}
}
