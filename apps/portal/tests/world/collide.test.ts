import { describe, expect, it } from 'vitest';
import { box, crosses, pillar, resolve, wall } from '../../src/lib/world/domain/collide';

describe('collision', () => {
	it('pushes a player out of a pillar', () => {
		const [x, z] = resolve(0.5, 0, 0.35, [pillar(0, 0, 0.5)]);
		expect(Math.hypot(x, z)).toBeCloseTo(0.85);
	});

	it('slides along a wall instead of passing through it', () => {
		const [x, z] = resolve(1, 0.2, 0.35, [wall(-5, 0, 5, 0, 0.1)]);
		expect(x).toBeCloseTo(1);
		expect(z).toBeCloseTo(0.45);
	});

	it('keeps the player inside the boundary', () => {
		const [x, z] = resolve(100, 0, 0.5, [], { radius: 50 });
		expect(Math.hypot(x, z)).toBeCloseTo(49.5);
	});

	it('ignores disabled tags (an opened ward)', () => {
		const ward = wall(-1, 0, 1, 0, 0.2, 'ward:vale');
		expect(resolve(0, 0.1, 0.35, [ward], undefined, new Set(['ward:vale']))).toEqual([0, 0.1]);
	});

	it('builds rotated boxes from four walls', () => {
		const walls = box(0, 0, 2, 4, Math.PI / 2);
		expect(walls).toHaveLength(4);
		// Rotated 90°, the 4 m side runs east–west (x ∈ [−2, 2]); a player just east of it is held off the wall.
		const [x, z] = resolve(2.2, 0, 0.35, walls);
		expect(x).toBeCloseTo(2.4);
		expect(z).toBeCloseTo(0);
	});

	it('detects a step through a portal plane', () => {
		const portal = wall(-1, 0, 1, 0);
		expect(crosses(portal, 0, 0.3, 0, -0.3)).toBe(true);
		expect(crosses(portal, 2, 0.3, 2, -0.3)).toBe(false);
		expect(crosses(portal, 0, 0.3, 0.2, 0.1)).toBe(false);
	});
});
