// Reactive state of the world's interface (Svelte 5 runes). The controller writes it; components read it.
// Per-viewer conveniences (settings, discovered places, tidbits found) persist in localStorage, wrapped in
// try/catch because storage can be blocked; nothing that must be shared or kept safe lives here.

import type { Viewer } from '../domain/access';
import type { Card } from '../domain/board';
import type { HudFrame } from '../engine/Engine';
import type { Quality } from '../engine/space';

export type Phase = 'title' | 'loading' | 'playing' | 'failed';
export type Overlay = 'map' | 'journal' | 'drawing' | 'cork' | 'wordwall' | 'notice' | 'evolution' | 'pause' | 'tidbit' | null;
export type JournalTab = 'profile' | 'guilds' | 'quests' | 'tidbits' | 'settings';

export interface Settings {
	quality: Quality;
	sound: boolean;
	volume: number;
	sensitivity: number;
	invertY: boolean;
	/** `system` follows prefers-reduced-motion. */
	motion: 'system' | 'reduced' | 'full';
}

export interface Notice {
	title: string;
	message: string;
	/** Offer the sign-in form from the notice. */
	signIn: boolean;
}

export interface Evolution {
	card: Card;
	expBefore: number;
	expAfter: number;
}

const SETTINGS_KEY = 'eisenhold.settings.v1';
const DISCOVERED_KEY = 'eisenhold.discovered.v1';
const TIDBITS_KEY = 'eisenhold.tidbits.v1';

function defaultQuality(): Quality {
	if (typeof matchMedia === 'undefined') return 'medium';
	if (matchMedia('(pointer: coarse)').matches) return 'low';
	return 'medium';
}

export function loadSettings(): Settings {
	const base: Settings = { quality: defaultQuality(), sound: true, volume: 0.6, sensitivity: 1, invertY: false, motion: 'system' };
	try {
		const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
		return {
			quality: raw.quality === 'low' || raw.quality === 'medium' || raw.quality === 'high' ? raw.quality : base.quality,
			sound: typeof raw.sound === 'boolean' ? raw.sound : base.sound,
			volume: typeof raw.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : base.volume,
			sensitivity: typeof raw.sensitivity === 'number' ? Math.min(3, Math.max(0.2, raw.sensitivity)) : base.sensitivity,
			invertY: raw.invertY === true,
			motion: raw.motion === 'reduced' || raw.motion === 'full' ? raw.motion : 'system'
		};
	} catch {
		return base;
	}
}

export function saveSettings(settings: Settings): void {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// Storage blocked: the settings still apply for this visit.
	}
}

function loadIds(key: string): string[] {
	try {
		const raw = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
		return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

function saveIds(key: string, ids: Iterable<string>): void {
	try {
		localStorage.setItem(key, JSON.stringify([...ids]));
	} catch {
		// Storage blocked: places and tidbits are found again next visit.
	}
}

export const loadDiscovered = (): string[] => loadIds(DISCOVERED_KEY);
export const saveDiscovered = (ids: Iterable<string>): void => saveIds(DISCOVERED_KEY, ids);
export const loadFound = (): string[] => loadIds(TIDBITS_KEY);
export const saveFound = (ids: Iterable<string>): void => saveIds(TIDBITS_KEY, ids);

export function prefersReducedMotion(settings: Settings): boolean {
	if (settings.motion !== 'system') return settings.motion === 'reduced';
	return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class WorldUi {
	phase = $state<Phase>('title');
	loadingLabel = $state('Waking Eisenhold…');
	failure = $state<string | null>(null);
	overlay = $state<Overlay>(null);
	journalTab = $state<JournalTab>('profile');
	hud = $state<HudFrame | null>(null);
	viewer = $state<Viewer | null>(null);
	authReady = $state(false);
	authAvailable = $state(false);
	authLabel = $state('');
	cards = $state<Card[]>([]);
	boardKind = $state<'local' | 'firestore' | 'memory' | 'none'>('none');
	boardError = $state<string | null>(null);
	health = $state<Record<string, 'ok' | 'down' | 'unknown'>>({});
	notice = $state<Notice | null>(null);
	toasts = $state<{ id: number; text: string }[]>([]);
	discovery = $state<{ title: string; subtitle: string } | null>(null);
	subtitle = $state<{ speaker: string; text: string } | null>(null);
	editing = $state<Card | null>(null);
	evolving = $state<Evolution | null>(null);
	travel = $state<{ title: string; tip: string } | null>(null);
	/** The tidbit being read (`fresh` the first time it is found), and every tidbit found in this browser. */
	reading = $state<{ id: string; fresh: boolean } | null>(null);
	found = $state<string[]>(loadFound());
	pointerLocked = $state(false);
	settings = $state<Settings>(loadSettings());
	/** Polite live-region text (prompts, discoveries, board changes). */
	announcement = $state('');

	private toastId = 0;

	toast(text: string, ms = 4200): void {
		const id = ++this.toastId;
		this.toasts = [...this.toasts, { id, text }].slice(-3);
		this.announcement = text;
		setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), ms);
	}
}
