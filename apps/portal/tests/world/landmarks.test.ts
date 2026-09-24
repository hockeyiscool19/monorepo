import { describe, expect, it } from 'vitest';
import { BRIDGE, LANDMARKS, landmarkInfo } from '../../src/lib/world/domain/landmarks';
import { bearing, fromSpot, headingOf, inFrontOf, layoutRealm, type RealmLayout } from '../../src/lib/world/domain/realm';
import { gate } from './fixtures';

const gates = (n: number) => Array.from({ length: n }, (_, i) => gate({ id: `app-${i}`, name: `App ${i}` }));
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Distance from a point to the segment a→b. */
function toSegment(p: { x: number; z: number }, ax: number, az: number, bx: number, bz: number): number {
	const dx = bx - ax;
	const dz = bz - az;
	const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz)));
	return Math.hypot(p.x - (ax + t * dx), p.z - (az + t * dz));
}

/** Everything the landmarks must keep clear of, with the radius each one needs. */
function occupied(layout: RealmLayout): { name: string; x: number; z: number; r: number }[] {
	return [
		...layout.gates.map((g) => ({ name: `gate ${g.gate.id}`, x: g.spot.x, z: g.spot.z, r: 7 })),
		{ name: 'cabin', ...layout.cabin, r: 9 },
		{ name: 'word wall', ...layout.wordWall, r: 7 },
		{ name: 'campfire', ...layout.campfire, r: 5 },
		{ name: 'spawn', ...layout.spawn, r: 4 },
		{ name: 'guard', ...layout.guard, r: 2 },
		{ name: 'square', x: 0, z: 0, r: layout.hubRadius }
	];
}

describe('landmarks', () => {
	it('places all six, deterministically, inside the walkable valley', () => {
		const one = layoutRealm(gates(3));
		expect(one.landmarks.map((l) => l.id)).toEqual(['rink', 'supercharger', 'vermont', 'cuenca', 'davidson', 'nrel']);
		expect(layoutRealm(gates(3)).landmarks).toEqual(one.landmarks);
		for (const l of one.landmarks) {
			expect(Math.hypot(l.spot.x, l.spot.z) + 4, l.id).toBeLessThan(one.boundary);
			// The spot where the path ends and fast travel lands is inside the valley too.
			const front = inFrontOf(l.spot, l.approach);
			expect(Math.hypot(front.x, front.z), l.id).toBeLessThan(one.boundary - 2);
		}
	});

	it('keeps clear of every gate, the cabin, the Word Wall, the campfire and the road in, for 1 to 10 apps', () => {
		for (let n = 1; n <= 10; n++) {
			const layout = layoutRealm(gates(n));
			for (const l of layout.landmarks) {
				// The rink is Stillwater Pond itself, which the pond's own clearing already accounts for.
				for (const o of occupied(layout)) {
					expect(dist(l.spot, o) - l.clear - o.r, `${l.id} vs ${o.name} with ${n} apps`).toBeGreaterThan(0);
				}
			}
		}
	});

	it('keeps landmarks apart from each other', () => {
		const { landmarks } = layoutRealm(gates(3));
		for (const a of landmarks) {
			for (const b of landmarks) {
				if (a === b) continue;
				expect(dist(a.spot, b.spot), `${a.id} vs ${b.id}`).toBeGreaterThan(a.clear + b.clear);
			}
		}
	});

	it('faces the square, except the Supercharger, which faces the road to its west', () => {
		const { landmarks } = layoutRealm(gates(3));
		for (const l of landmarks) {
			const heading = headingOf(l.spot.yaw);
			const expected = l.id === 'supercharger' ? 270 : bearing(l.spot.x, l.spot.z, 0, 0);
			expect(Math.abs(((heading - expected + 540) % 360) - 180), l.id).toBeLessThan(0.01);
		}
	});

	it('the rink is Stillwater Pond', () => {
		const layout = layoutRealm(gates(3));
		expect(layout.landmarks.find((l) => l.id === 'rink')?.spot).toEqual(layout.pond);
	});

	it('runs the Vermont brook under the covered bridge at right angles, clear of every other place', () => {
		const layout = layoutRealm(gates(3));
		const vermont = layout.landmarks.find((l) => l.id === 'vermont')!;
		const [brook] = layout.brooks;
		const [deck] = layout.decks;
		expect(dist(deck, vermont.spot)).toBeCloseTo(0);
		expect(deck.yaw).toBeCloseTo(vermont.spot.yaw);
		expect(deck.length).toBe(BRIDGE.length);
		// The brook passes through the middle of the bridge, perpendicular to the way you walk through it.
		expect(toSegment(vermont.spot, brook.ax, brook.az, brook.bx, brook.bz)).toBeCloseTo(0);
		const along = { x: -Math.sin(deck.yaw), z: -Math.cos(deck.yaw) };
		const flow = { x: brook.bx - brook.ax, z: brook.bz - brook.az };
		expect(Math.abs(along.x * flow.x + along.z * flow.z)).toBeLessThan(1e-9);
		// The bridge is longer than the brook is wide, so both ends stand on dry ground.
		expect(deck.length / 2).toBeGreaterThan(brook.width);
		for (const o of [...occupied(layout), ...layout.landmarks.filter((l) => l.id !== 'vermont').map((l) => ({ name: l.id, ...l.spot, r: l.clear }))]) {
			expect(toSegment(o, brook.ax, brook.az, brook.bx, brook.bz) - o.r - brook.width, o.name).toBeGreaterThan(0);
		}
	});

	it('stands the Heartcell at the centre and the lectern just south of the dais, facing the road in', () => {
		const layout = layoutRealm(gates(3));
		expect(layout.heartcell).toMatchObject({ x: 0, z: 0 });
		expect(layout.lectern.z).toBeGreaterThan(3);
		expect(layout.lectern.z).toBeLessThan(layout.hubRadius - 2);
		expect(headingOf(layout.lectern.yaw)).toBeCloseTo(180);
	});

	it('keeps the Heartcell and the lectern out of the line from the spawn to the northern gate', () => {
		const layout = layoutRealm(gates(3));
		const north = layout.gates[1].spot;
		const { spawn } = layout;
		// The portal's edges seen from the spawn pass east of both, with room to spare.
		const edge = fromSpot(north, 1.35, 0);
		const other = fromSpot(north, -1.35, 0);
		for (const e of [edge, other]) {
			for (const [thing, r] of [[layout.heartcell, 0.7], [layout.lectern, 0.6]] as const) {
				const t = (thing.z - spawn.z) / (e.z - spawn.z);
				const x = spawn.x + (e.x - spawn.x) * t;
				expect(Math.abs(x - thing.x), `${thing === layout.lectern ? 'lectern' : 'heartcell'}`).toBeGreaterThan(r);
			}
		}
	});

	it('puts the Memory Lane signpost beside the road in, in view of the spawn', () => {
		const layout = layoutRealm(gates(3));
		const { memoryLane: post, spawn } = layout;
		// Beside the road (which runs from the square's south edge to beyond the spawn), not on it.
		const road = toSegment(post, 0, layout.hubRadius - 0.5, spawn.x, spawn.z + 30);
		expect(road).toBeGreaterThan(1.8);
		expect(road).toBeLessThan(4);
		// Within 40° of where the traveller first looks.
		const off = Math.abs(((headingOf(spawn.yaw) - bearing(spawn.x, spawn.z, post.x, post.z) + 540) % 360) - 180);
		expect(off).toBeLessThan(40);
	});

	it('looks landmarks up by id', () => {
		expect(landmarkInfo('nrel')?.name).toBe('NREL, Golden');
		expect(landmarkInfo('nope')).toBeUndefined();
		expect(new Set(LANDMARKS.map((l) => l.id)).size).toBe(LANDMARKS.length);
	});
});
