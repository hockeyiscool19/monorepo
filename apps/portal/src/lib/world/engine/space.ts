// The contract between the engine and a space (the overworld, My Get-a-way): what a space must hand back
// so the engine can walk the player through it, point the compass, offer interactions and grade the frame.

import type * as THREE from 'three';
import type { Capsule } from '../domain/collide';
import type { Spot } from '../domain/realm';
import type { Card } from '../domain/board';

export type SpaceId = 'overworld' | 'getaway';

export type Quality = 'low' | 'medium' | 'high';

/** What the player can use with E. `id` is stable (`gate:vale`, `getaway:cork`, `tidbit:heartcell`, …). */
export type InteractKind = 'gate' | 'cabin-door' | 'exit-door' | 'drawing-board' | 'cork-board' | 'word-wall' | 'guard' | 'signpost' | 'campfire' | 'tidbit';

export interface Interactable {
	id: string;
	kind: InteractKind;
	/** Where the thing itself is: the player must look roughly towards it. */
	x: number;
	z: number;
	/** How close the player must stand to it. */
	radius: number;
	/** Height of the thing: when two are in reach, the one nearest the crosshair wins. */
	y: number;
}

/** A plane the player walks through (a portal): crossing it fires `onPortal`. */
export interface Trigger {
	id: string;
	capsule: Capsule;
}

/** A compass marker. */
export interface Marker {
	id: string;
	x: number;
	z: number;
	icon: string;
	label: string;
	/** Shown only within this many metres until discovered (a place you stumble on); omitted = always shown. */
	reveal?: number;
}

/** Film grade for a space, fed to the grade shader. */
export interface Grade {
	grain: number;
	vignette: number;
	leak: number;
	aberration: number;
	saturation: number;
	tint: [number, number, number];
	lift: [number, number, number];
	weave: number;
}

export interface Bloom {
	strength: number;
	radius: number;
	threshold: number;
}

export interface FrameContext {
	t: number;
	dt: number;
	player: { x: number; y: number; z: number; yaw: number };
	camera: THREE.PerspectiveCamera;
	reducedMotion: boolean;
}

/** Visual state of a gate as the UI decided it (the engine never decides access). */
export type GateLook = 'open' | 'sealed' | 'dormant' | 'unstable';

export interface Space {
	id: SpaceId;
	scene: THREE.Scene;
	fov: number;
	far: number;
	spawns: Record<string, Spot>;
	eyeHeight: number;
	walkSpeed: number;
	runSpeed: number;
	colliders: Capsule[];
	/** Collider tags currently switched off (opened wards). */
	disabled: Set<string>;
	boundary?: { radius: number; cx?: number; cz?: number };
	heightAt(x: number, z: number): number;
	interactables: Interactable[];
	triggers: Trigger[];
	markers: Marker[];
	grade: Grade;
	bloom: Bloom;
	/** Ambient sound bed for the audio engine. */
	ambience: 'wind' | 'cabin';
	/** Point lights and flames near the player modulate these sound sources. */
	sounds: { kind: 'fire' | 'portal'; x: number; z: number; key: string }[];
	update(ctx: FrameContext): void;
	setGateLook?(id: string, look: GateLook): void;
	setBoard?(cards: Card[]): void;
	dispose(): void;
}

export interface BuildContext {
	quality: Quality;
	pixelRatio: number;
	reducedMotion: boolean;
	renderer: THREE.WebGLRenderer;
}
