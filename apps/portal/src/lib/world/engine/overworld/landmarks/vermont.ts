// Green Mountain Crossing: a red Vermont covered bridge over a frozen brook, walked straight through on the way in.
// Its portal carries its name and the old sign about crossing faster than a walk. Past it, a sugarbush of bare
// maples with sap buckets and a sugarhouse letting off steam; before it, the green and gold of Burr and Burton.

import * as THREE from 'three';
import { BRIDGE } from '../../../domain/landmarks';
import type { PlacedLandmark } from '../../../domain/realm';
import { rng } from '../../noise';
import { FIRE, NIGHT, STONE, VERMONT, WOOD } from '../../palette';
import { smoke } from '../../particles';
import { softDot } from '../../textures/common';
import { paintedBoard, siding } from '../../textures/landmarks';
import { Kit, type KitContext, type Site } from './kit';

const HALF_W = BRIDGE.width / 2 + 0.02;
const HALF_L = BRIDGE.length / 2;
const WALL = 2.9;
const RISE = 1.1;

/** The bridge, along local z; y = 0 is the deck the traveller walks on. */
function bridge(kit: Kit): void {
	const timber = kit.solid(VERMONT.deck, 0.85);
	const dark = kit.solid(WOOD.logDark, 0.9);
	const stone = kit.solid(STONE.mid, 0.9);
	kit.box(BRIDGE.width + 0.1, 0.3, BRIDGE.length, timber, 0, -0.15, 0);
	for (const x of [-1.6, 1.6]) kit.box(0.3, 0.5, BRIDGE.length, dark, x, -0.55, 0);
	// Stone abutments on the brook's banks, under the deck.
	for (const z of [-2.6, 2.6]) kit.box(BRIDGE.width + 0.4, 1.2, 1.0, stone, 0, -0.9, z);
	// Ramps down to the snow at both ends.
	for (const end of [-1, 1]) kit.box(3.6, 0.06, 1.3, timber, 0, -0.12, end * (HALF_L + 0.55), 0, end * 0.18);

	const tex = siding();
	tex.repeat.set(4, 1);
	const boards = kit.face(tex, { roughness: 0.9 });
	for (const side of [-1, 1]) {
		kit.box(0.12, WALL, BRIDGE.length, boards, side * HALF_W, WALL / 2, 0);
		// Daylight windows along each side.
		for (const z of [-3, 0, 3]) kit.box(0.02, 0.5, 0.9, kit.solid(VERMONT.signboard, 0.9), side * (HALF_W + 0.065), 1.65, z);
		kit.wall(side * HALF_W, -HALF_L, side * HALF_W, HALF_L, 0.12);
	}
	// Tie beams inside, and a lantern hung from the middle one.
	for (const z of [-3.6, 0, 3.6]) kit.box(BRIDGE.width, 0.18, 0.18, dark, 0, WALL - 0.12, z);
	kit.box(0.14, 0.2, 0.14, kit.solid(FIRE.flame, 0.5, 0, FIRE.flame, 2.2), 0, WALL - 0.55, 0);
	kit.cyl(0.006, 0.006, 0.36, dark, 0, WALL - 0.3, 0, 4);

	// Gabled roof with snow on it, and the portals' headers and gables.
	const pitch = Math.atan2(RISE, HALF_W + 0.35);
	const slope = Math.hypot(RISE, HALF_W + 0.35);
	const roof = kit.solid(VERMONT.roof, 0.8, 0.2);
	const snow = kit.solid(NIGHT.snow, 0.9);
	for (const side of [-1, 1]) {
		const x = (side * (HALF_W + 0.35)) / 2;
		kit.box(slope, 0.14, BRIDGE.length + 0.8, roof, x, WALL + RISE / 2 + 0.07, 0, 0, 0, -side * pitch);
		kit.box(slope * 0.98, 0.1, BRIDGE.length + 0.7, snow, x + side * 0.045, WALL + RISE / 2 + 0.19, 0, 0, 0, -side * pitch);
	}
	const barn = kit.solid(VERMONT.barn, 0.9);
	// Seen from inside the bridge too, so both faces are drawn.
	const gableMat = kit.keep(new THREE.MeshStandardMaterial({ color: VERMONT.barn, roughness: 0.9, side: THREE.DoubleSide }));
	const gable = new THREE.Shape([new THREE.Vector2(-HALF_W - 0.06, 0), new THREE.Vector2(HALF_W + 0.06, 0), new THREE.Vector2(0, RISE)]);
	for (const end of [-1, 1]) {
		kit.box(BRIDGE.width + 0.2, 0.36, 0.16, barn, 0, WALL - 0.18, end * HALF_L);
		kit.piece(new THREE.ShapeGeometry(gable), gableMat, 0, WALL, end * (HALF_L + 0.01), 0, end < 0 ? Math.PI : 0, 0);
	}
	// The hub-facing portal: its name on the header, the old fine on the gable.
	const name = paintedBoard(['GREEN MOUNTAIN CROSSING'], { ground: VERMONT.signboard, ink: VERMONT.trim, w: 1024, h: 120 });
	kit.plane(3.4, 0.36, kit.face(name), 0, WALL - 0.18, -HALF_L - 0.09);
	const fine = paintedBoard(['ONE DOLLAR FINE', 'FOR CROSSING THIS BRIDGE FASTER THAN A WALK'], { ground: VERMONT.trim, ink: VERMONT.signboard, font: 'sans', w: 1024, h: 200 });
	kit.plane(2.0, 0.4, kit.face(fine), 0, WALL + 0.34, -HALF_L - 0.02);
}

/** The frozen brook's ice, laid on the carved bed where it passes under the bridge. */
function brook(kit: Kit): void {
	const ice = kit.keep(new THREE.MeshStandardMaterial({ color: VERMONT.brookIce, roughness: 0.15, metalness: 0.25 }));
	const bed = -BRIDGE.brookDepth - kit.baseY + 0.03;
	kit.piece(new THREE.PlaneGeometry(BRIDGE.brookHalf * 2 - 2, BRIDGE.brookWidth - 0.4), ice, 0, bed, 0, -Math.PI / 2);
}

/** A bare sugar maple with a sap bucket on its trunk facing `face` (radians around the trunk). */
function maple(kit: Kit, x: number, z: number, seed: number, face: number): void {
	const rand = rng(seed);
	const bark = kit.solid(VERMONT.maple, 0.95);
	const y0 = kit.ground(x, z);
	const h = 3.0 + rand() * 0.8;
	kit.cyl(0.2, 0.3, h, bark, x, y0 + h / 2, z, 8);
	const limbs = 5 + Math.floor(rand() * 2);
	for (let i = 0; i < limbs; i++) {
		const a = (i / limbs) * Math.PI * 2 + rand() * 0.6;
		const lean = 0.55 + rand() * 0.35;
		const len = 1.8 + rand() * 1.2;
		const bx = x + Math.sin(a) * Math.sin(lean) * (len / 2);
		const bz = z + Math.cos(a) * Math.sin(lean) * (len / 2);
		const by = y0 + h - 0.4 + Math.cos(lean) * (len / 2);
		kit.piece(new THREE.CylinderGeometry(0.05, 0.13, len, 6), bark, bx, by, bz, lean, a, 0);
		for (let k = 0; k < 2; k++) {
			const ta = a + (rand() - 0.5) * 1.4;
			const tl = 0.7 + rand() * 0.6;
			const tx = bx + Math.sin(a) * Math.sin(lean) * (len / 2) + Math.sin(ta) * 0.25;
			const tz = bz + Math.cos(a) * Math.sin(lean) * (len / 2) + Math.cos(ta) * 0.25;
			kit.piece(new THREE.CylinderGeometry(0.02, 0.05, tl, 5), bark, tx, by + Math.cos(lean) * (len / 2) + tl * 0.35, tz, 0.3 + rand() * 0.4, ta, 0);
		}
	}
	// Sap bucket, lid and spout on the trunk.
	const metal = kit.solid(VERMONT.bucket, 0.45, 0.6);
	const bx = x + Math.sin(face) * 0.36;
	const bz = z + Math.cos(face) * 0.36;
	kit.cyl(0.13, 0.11, 0.3, metal, bx, y0 + 1.15, bz, 12);
	kit.box(0.34, 0.02, 0.32, metal, bx, y0 + 1.33, bz, face, -0.25);
	kit.piece(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 5), metal, x + Math.sin(face) * 0.27, y0 + 1.36, z + Math.cos(face) * 0.27, Math.PI / 2, face, 0);
	kit.pillar(x, z, 0.4);
}

/** The sugarhouse: a little shed boiling sap, warm light in its window and steam from its cupola. */
function sugarhouse(kit: Kit, x: number, z: number, ry: number): { update(t: number): void } {
	const y0 = kit.ground(x, z);
	const boards = kit.solid(WOOD.plank, 0.9);
	const roof = kit.solid(VERMONT.roof, 0.8, 0.2);
	kit.box(3.2, 2.4, 2.6, boards, x, y0 + 1.2, z, ry);
	for (const side of [-1, 1]) {
		const c = Math.cos(ry);
		const s = Math.sin(ry);
		const [rx, rz] = [x + side * 0.85 * c, z - side * 0.85 * s];
		kit.box(1.9, 0.1, 3.0, roof, rx, y0 + 2.8, rz, ry, 0, -side * 0.62);
	}
	kit.box(0.8, 0.7, 0.8, boards, x, y0 + 3.4, z, ry);
	kit.box(1.1, 0.08, 1.1, roof, x, y0 + 3.8, z, ry);
	const glow = kit.solid(WOOD.windowGlow, 0.6, 0, WOOD.windowGlow, 1.6);
	kit.plane(0.8, 0.6, glow, x - Math.sin(ry) * 1.31, y0 + 1.4, z - Math.cos(ry) * 1.31, ry);
	kit.walls(x, z, 3.3, 2.7, ry);
	const steam = smoke({ count: 14, height: 5, drift: 0.7, spread: 0.5, color: new THREE.Color(NIGHT.snow), pixelRatio: kit.ctx.pixelRatio, map: kit.keep(softDot(64, 0.1)) });
	kit.keep(steam);
	kit.add(steam.points, x, y0 + 3.9, z);
	return { update: (t) => steam.update(t) };
}

export function buildVermont(landmark: PlacedLandmark, ctx: KitContext): Site {
	const kit = new Kit('vermont', landmark.spot, ctx);
	bridge(kit);
	brook(kit);
	const trees: [number, number, number][] = [
		[-7.4, -6.6, 0.4],
		[7.0, -7.2, -0.6],
		[-8.2, 5.8, 2.4],
		[-2.4, 11.0, 3.0],
		[3.6, 9.0, -2.6],
		[7.4, 6.6, -2.2]
	];
	trees.forEach(([x, z, face], i) => maple(kit, x, z, 31 + i, face));
	const shack = sugarhouse(kit, -6.4, 10.2, 0.5);
	kit.tidbit('sugarbush', 3.6, 9.0, 1.2, 2.4);

	const bba = paintedBoard(['BURR AND BURTON ACADEMY', 'BULLDOGS · MANCHESTER, VERMONT'], { ground: VERMONT.bbaGreen, ink: VERMONT.bbaGold, border: VERMONT.bbaGold, w: 1024, h: 340 });
	kit.sign(bba, -3.8, -7.4, { ry: -0.3, w: 2.6, h: 0.86, post: 1.1, tidbit: 'burr-and-burton' });
	const state = paintedBoard(['VERMONT', 'THE GREEN MOUNTAIN STATE'], { ground: VERMONT.signboard, ink: VERMONT.trim, border: VERMONT.trim, w: 512, h: 170 });
	kit.sign(state, 3.6, -7.2, { ry: 0.3, w: 1.6, h: 0.53, tidbit: 'covered-bridge' });

	kit.onUpdate((t) => shack.update(t));
	return kit.build();
}
