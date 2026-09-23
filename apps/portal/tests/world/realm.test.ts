import { describe, expect, it } from 'vitest';
import {
	bearing,
	gateAngles,
	gateRing,
	GATE_RING,
	headingOf,
	hueFor,
	inFrontOf,
	layoutRealm,
	onRing,
	yawToward
} from '../../src/lib/world/domain/realm';
import { gate } from './fixtures';

const deg = (r: number) => (r * 180) / Math.PI;

describe('realm layout', () => {
	it('spreads gates 25° apart over the northern arc, never past ±95°', () => {
		expect(gateAngles(0)).toEqual([]);
		expect(gateAngles(1)).toEqual([0]);
		expect(gateAngles(3).map((a) => Math.round(deg(a)))).toEqual([-50, 0, 50]);
		const many = gateAngles(12).map(deg);
		expect(Math.min(...many)).toBeCloseTo(-95);
		expect(Math.max(...many)).toBeCloseTo(95);
	});

	it('widens the ring so neighbouring gates stay at least 9 m apart', () => {
		expect(gateRing(3)).toBe(GATE_RING);
		for (const n of [8, 12, 20]) {
			const ring = gateRing(n);
			const angles = gateAngles(n);
			const a = onRing(angles[0], ring);
			const b = onRing(angles[1], ring);
			expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(8.9);
		}
	});

	it('places gates facing the hub and is deterministic', () => {
		const gates = [gate({ id: 'a' }), gate({ id: 'b' }), gate({ id: 'c' })];
		const one = layoutRealm(gates);
		expect(layoutRealm(gates)).toEqual(one);
		for (const placed of one.gates) {
			const toward = yawToward(placed.spot.x, placed.spot.z, 0, 0);
			expect(placed.spot.yaw).toBeCloseTo(toward);
			expect(Math.hypot(placed.spot.x, placed.spot.z)).toBeCloseTo(GATE_RING);
		}
		// The middle gate stands due north of the hub, the spawn due south.
		expect(one.gates[1].spot.x).toBeCloseTo(0);
		expect(one.gates[1].spot.z).toBeLessThan(0);
		expect(one.spawn.z).toBeGreaterThan(0);
	});

	it('keeps known app colours and hashes the rest into [0, 1)', () => {
		expect(hueFor('vale')).toBeCloseTo(0.36);
		const h = hueFor('something-new');
		expect(h).toBeGreaterThanOrEqual(0);
		expect(h).toBeLessThan(1);
		expect(hueFor('something-new')).toBe(h);
	});
});

describe('compass math', () => {
	it('bearings: north 0, east 90, south 180, west 270', () => {
		expect(bearing(0, 0, 0, -10)).toBeCloseTo(0);
		expect(bearing(0, 0, 10, 0)).toBeCloseTo(90);
		expect(bearing(0, 0, 0, 10)).toBeCloseTo(180);
		expect(bearing(0, 0, -10, 0)).toBeCloseTo(270);
	});

	it('heading of a yaw: 0 faces north, turning left (positive yaw) heads west', () => {
		expect(headingOf(0)).toBeCloseTo(0);
		expect(headingOf(Math.PI / 2)).toBeCloseTo(270);
		expect(headingOf(-Math.PI / 2)).toBeCloseTo(90);
	});

	it('a spot in front of a gate faces the gate', () => {
		const spot = onRing(Math.PI / 4, 20);
		const front = inFrontOf(spot, 5);
		expect(Math.hypot(front.x, front.z)).toBeCloseTo(15);
		expect(bearing(front.x, front.z, spot.x, spot.z)).toBeCloseTo(headingOf(front.yaw));
	});
});
