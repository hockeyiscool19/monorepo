// Davidson College: a red-brick hall with lit windows behind a white hexastyle portico and a white dome, Wildcats
// banners in red and black between the columns, a brick walk with lamps, and a hoop off to the side for the 2008
// run to the Elite Eight.

import * as THREE from 'three';
import type { PlacedLandmark } from '../../../domain/realm';
import { DAVIDSON, STONE } from '../../palette';
import { hangingBanner } from '../../textures/cloth';
import { backboard } from '../../textures/keepsakes';
import { bricks, netMesh, paintedBoard } from '../../textures/landmarks';
import { dome, Kit, type KitContext, type Site } from './kit';

const HALL = { w: 14, h: 6.4, d: 7, z: 5.5 };
const COLUMNS = [-3.5, -2.1, -0.7, 0.7, 2.1, 3.5];

function hall(kit: Kit): void {
	const brick = kit.face(bricks(1837, DAVIDSON.brick, STONE.mortar, [4, 2]), { roughness: 0.9 });
	const white = kit.solid(DAVIDSON.column, 0.6);
	const front = HALL.z - HALL.d / 2;
	kit.box(HALL.w, HALL.h, HALL.d, brick, 0, HALL.h / 2, HALL.z);
	kit.box(HALL.w + 0.3, 0.35, HALL.d + 0.3, white, 0, HALL.h + 0.17, HALL.z);
	kit.walls(0, HALL.z, HALL.w, HALL.d);
	// Lit windows either side of the portico, framed in white.
	const glass = kit.solid(DAVIDSON.window, 0.5, 0, DAVIDSON.window, 0.6);
	for (const x of [-6.1, -4.7, 4.7, 6.1]) {
		for (const y of [1.9, 4.5]) {
			kit.box(0.95, 1.55, 0.06, white, x, y, front - 0.03);
			kit.plane(0.75, 1.35, glass, x, y, front - 0.07);
		}
	}
	// The dome over the middle of the hall, on a drum tall enough to crown the portico seen from the walk.
	const drum = 2.4;
	const base = HALL.h + 0.35 + drum;
	kit.cyl(2.0, 2.05, drum, white, 0, HALL.h + 0.35 + drum / 2, HALL.z, 28);
	kit.piece(dome(2.05), kit.solid(DAVIDSON.column, 0.45, 0.1), 0, base, HALL.z);
	kit.cyl(0.35, 0.42, 1.0, white, 0, base + 2.05 + 0.4, HALL.z, 12);
	kit.piece(new THREE.ConeGeometry(0.45, 0.6, 12), kit.solid(DAVIDSON.roof, 0.6, 0.3), 0, base + 2.05 + 1.2, HALL.z);
}

function portico(kit: Kit): void {
	const white = kit.solid(DAVIDSON.column, 0.6);
	const step = kit.solid(STONE.light, 0.9);
	for (let i = 0; i < 3; i++) kit.box(8.6 - i * 0.4, 0.25, 3.4 - i * 0.4, step, 0, 0.125 + i * 0.25, 0.3 + i * 0.2);
	const top = 0.75;
	for (const x of COLUMNS) {
		kit.box(0.66, 0.16, 0.66, white, x, top + 0.08, -0.2);
		kit.cyl(0.27, 0.3, 4.6, white, x, top + 0.16 + 2.3, -0.2, 16);
		kit.box(0.72, 0.18, 0.72, white, x, top + 4.85, -0.2);
	}
	const beam = top + 5.29;
	kit.box(8.2, 0.7, 2.7, white, 0, beam, 0.75);
	const pediment = new THREE.Shape([new THREE.Vector2(-4.2, 0), new THREE.Vector2(4.2, 0), new THREE.Vector2(0, 1.1)]);
	const prism = new THREE.ExtrudeGeometry(pediment, { depth: 2.7, bevelEnabled: false });
	kit.piece(prism, white, 0, beam + 0.35, -0.6);
	const frieze = paintedBoard(['DAVIDSON COLLEGE'], { ground: DAVIDSON.column, ink: DAVIDSON.ink, w: 1024, h: 90 });
	kit.plane(5.4, 0.46, kit.face(frieze), 0, beam, -0.61);
	// Wildcats banners in the outer bays.
	for (const [x, big] of [
		[2.8, 'D'],
		[-2.8, 'W']
	] as const) {
		kit.cloth(hangingBanner(big, big === 'D' ? 'DAVIDSON' : 'WILDCATS', DAVIDSON.red, DAVIDSON.column, DAVIDSON.ink), 0.74, 2.1, x, top + 3.5, -0.35, 0, 0.35);
	}
	kit.walls(0, 0.4, 8.8, 3.6);
}

/** The hoop: a pole, an arm, a backboard with the red square, an orange rim and a net, facing the walk. */
function hoop(kit: Kit, x: number, z: number): void {
	const y0 = kit.ground(x, z);
	const ink = kit.solid(DAVIDSON.ink, 0.5, 0.4);
	kit.cyl(0.07, 0.09, 3.4, ink, x, y0 + 1.7, z, 10);
	kit.box(0.9, 0.08, 0.08, ink, x - 0.45, y0 + 3.2, z);
	kit.box(0.05, 1.05, 1.8, kit.face(backboard(), { roughness: 0.4 }), x - 0.9, y0 + 3.35, z);
	kit.piece(new THREE.TorusGeometry(0.23, 0.018, 6, 24), kit.solid(DAVIDSON.rim, 0.5, 0.3), x - 1.16, y0 + 3.05, z, Math.PI / 2);
	const netting = kit.face(netMesh(DAVIDSON.backboard), { transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
	kit.piece(new THREE.CylinderGeometry(0.23, 0.15, 0.42, 14, 1, true), netting, x - 1.16, y0 + 2.84, z);
	kit.pillar(x, z, 0.25);
	kit.tidbit('wildcats-hoop', x - 1.1, z, y0 + 3.0, 3.0);
}

function lamp(kit: Kit, x: number, z: number): void {
	const y0 = kit.ground(x, z);
	const ink = kit.solid(DAVIDSON.ink, 0.5, 0.4);
	kit.cyl(0.05, 0.07, 3.0, ink, x, y0 + 1.5, z, 8);
	kit.piece(new THREE.SphereGeometry(0.2, 12, 10), kit.solid(DAVIDSON.window, 0.5, 0, DAVIDSON.window, 1.1), x, y0 + 3.15, z);
	kit.pillar(x, z, 0.15);
}

export function buildDavidson(landmark: PlacedLandmark, ctx: KitContext): Site {
	const kit = new Kit('davidson', landmark.spot, ctx);
	hall(kit);
	portico(kit);
	kit.box(3.2, 0.04, 8.4, kit.face(bricks(2008, DAVIDSON.brick, STONE.mortar, [1, 3]), { roughness: 0.95 }), 0, 0.02, -5.8);
	for (const x of [-2.4, 2.4]) lamp(kit, x, -6.2);
	hoop(kit, 9.4, -3.6);
	const sign = paintedBoard(['DAVIDSON COLLEGE', 'NORTH CAROLINA · FOUNDED 1837'], { ground: DAVIDSON.red, ink: DAVIDSON.column, border: DAVIDSON.ink, w: 512, h: 170 });
	kit.sign(sign, -3.8, -7.6, { ry: 0.3, w: 1.7, h: 0.56, tidbit: 'davidson' });
	return kit.build();
}
