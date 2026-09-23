// The realm model: what the 3D world knows about the platform, and where everything stands in it.
// Pure: no DOM, no three.js, no I/O. The page's build-time load turns the registry into RealmData;
// layoutRealm() places gates, the cabin and the Word Wall around the hub so the engine only draws.

export type GateStatus = 'live' | 'beta' | 'planned';

/** One app, as a gate in the world. `href` is null for planned apps (a dormant gate). */
export interface RealmGate {
	id: string;
	name: string;
	description: string;
	icon: string;
	status: GateStatus;
	href: string | null;
	/** The app's path prefix, e.g. `/vale` — where the gateway door lives. */
	path: string;
	version: string | null;
	sha: string | null;
	deployedAt: string | null;
	/** Present when the app is served through the gateway door. `[]` = any signed-in user. */
	access: { groups: string[] } | null;
}

/** A group profile from `platform.auth.groups`. */
export interface GuildProfile {
	id: string;
	name: string;
	emblem: string;
	description: string;
}

export interface RealmAuth {
	enabled: boolean;
	projectId: string;
	sessionHours: number;
	groups: GuildProfile[];
}

/** Everything the world page receives from the build. */
export interface RealmData {
	domain: string;
	gates: RealmGate[];
	auth: RealmAuth | null;
	healthUrl: string;
	registryHref: string;
	classicHref: string;
}

/** A point on the ground plane. x grows east, z grows south; yaw 0 faces north (−z), positive turns left. */
export interface Spot {
	x: number;
	z: number;
	yaw: number;
}

export interface PlacedGate {
	gate: RealmGate;
	spot: Spot;
	/** Hue in [0, 1) for the portal, banner and runes. */
	hue: number;
}

export interface RealmLayout {
	gates: PlacedGate[];
	cabin: Spot;
	wordWall: Spot;
	guard: Spot;
	campfire: Spot;
	pond: Spot;
	spawn: Spot;
	/** Radius of the paved hub around the origin. */
	hubRadius: number;
	/** Players are kept inside this radius (the mountains begin beyond it). */
	boundary: number;
}

export const HUB_RADIUS = 11;
export const GATE_RING = 23;
export const BOUNDARY = 96;

/** Known apps keep a recognisable colour (Vale green, HealthConnect ember, Topology violet); others hash to one. */
const HUES: Record<string, number> = { vale: 0.36, healthconnect: 0.05, topology: 0.76 };

export function hueFor(id: string): number {
	if (id in HUES) return HUES[id];
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
	return ((h >>> 0) % 360) / 360;
}

/** Yaw that makes something standing at (x, z) face the point (tx, tz). */
export function yawToward(x: number, z: number, tx: number, tz: number): number {
	return Math.atan2(-(tx - x), -(tz - z));
}

/** A spot on a ring around the origin, `angle` in radians clockwise from north, facing the centre. */
export function onRing(angle: number, radius: number): Spot {
	const x = Math.sin(angle) * radius;
	const z = -Math.cos(angle) * radius;
	return { x, z, yaw: yawToward(x, z, 0, 0) };
}

const DEG = Math.PI / 180;
/** Gates never spread past ±95° so the cabin (118° east) and the Word Wall (118° west) keep their places. */
const MAX_SPREAD = 95 * DEG;
/** Minimum distance between neighbouring gates, in metres of arc. */
const GATE_SPACING = 9;

/**
 * Spread `count` gates over the northern arc so the player sees them all from the spawn point:
 * 25° apart, never wider than ±95°.
 */
export function gateAngles(count: number): number[] {
	if (count <= 0) return [];
	if (count === 1) return [0];
	const spread = Math.min(MAX_SPREAD, 25 * DEG * (count - 1));
	return Array.from({ length: count }, (_, i) => -spread + (2 * spread * i) / (count - 1));
}

/** Ring radius that keeps neighbouring gates at least GATE_SPACING apart. */
export function gateRing(count: number): number {
	if (count <= 1) return GATE_RING;
	const spread = Math.min(MAX_SPREAD, 25 * DEG * (count - 1));
	return Math.max(GATE_RING, (GATE_SPACING * (count - 1)) / (2 * spread));
}

/** Place every gate and landmark. Deterministic: the same gates always give the same realm. */
export function layoutRealm(gates: RealmGate[]): RealmLayout {
	const angles = gateAngles(gates.length);
	const ring = gateRing(gates.length);
	const placed = gates.map((gate, i) => ({ gate, spot: onRing(angles[i], ring), hue: hueFor(gate.id) }));
	const east = 118 * DEG;
	return {
		gates: placed,
		cabin: onRing(east, 27),
		wordWall: onRing(-east, 19),
		guard: { x: 4.2, z: 15.5, yaw: yawToward(4.2, 15.5, 0, 24) },
		campfire: onRing(150 * DEG, 20),
		pond: onRing(-150 * DEG, 34),
		// A step east of the road, so the soul gem over the dais never hides the northern gate.
		spawn: { x: 3, z: 24, yaw: yawToward(3, 24, 0, -ring) },
		hubRadius: HUB_RADIUS,
		boundary: BOUNDARY
	};
}

/** A spot `distance` metres in front of `spot` (along its facing), turned to face it. */
export function inFrontOf(spot: Spot, distance: number): Spot {
	const x = spot.x - Math.sin(spot.yaw) * distance;
	const z = spot.z - Math.cos(spot.yaw) * distance;
	return { x, z, yaw: yawToward(x, z, spot.x, spot.z) };
}

/** Compass bearing in degrees [0, 360) from (x, z) to (tx, tz); 0 = north, 90 = east. */
export function bearing(x: number, z: number, tx: number, tz: number): number {
	const deg = (Math.atan2(tx - x, -(tz - z)) * 180) / Math.PI;
	return (deg + 360) % 360;
}

/** Heading in degrees [0, 360) of a yaw (0 = north, 90 = east). */
export function headingOf(yaw: number): number {
	const deg = (-yaw * 180) / Math.PI;
	return ((deg % 360) + 360) % 360;
}
