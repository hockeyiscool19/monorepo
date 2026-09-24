// Cuenca, Ecuador: a brick plaza before a small New Cathedral — three domes of blue and white glazed tile, a rose
// window, and two towers that stop short, as the real ones do — street lamps, a gonfalon in the city's red and
// yellow, and a goal with a ball for Deportivo Cuenca under the club's banner.

import * as THREE from 'three';
import type { PlacedLandmark } from '../../../domain/realm';
import { CUENCA, STONE, WOOD } from '../../palette';
import { gonfalon } from '../../textures/cloth';
import { bricks, domeTiles, netMesh, paintedBoard, soccerBall } from '../../textures/landmarks';
import { dome, goal, Kit, type KitContext, type Site } from './kit';

/** The nave's back half and the facade's line (local z), and the nave's roof height. */
const FACADE_Z = 1.6;
const NAVE = { w: 7.4, h: 5.0, d: 8.0 };

function cathedral(kit: Kit): void {
	const brick = kit.face(bricks(1885, CUENCA.brick, CUENCA.brickDark, [3, 2]), { roughness: 0.9 });
	const stone = kit.solid(CUENCA.stone, 0.85);
	const navZ = FACADE_Z + NAVE.d / 2;
	kit.box(NAVE.w, NAVE.h, NAVE.d, brick, 0, NAVE.h / 2, navZ);
	// A brick facade with stone dressing, as the real one wears brick and marble.
	kit.box(8.6, 5.8, 0.6, brick, 0, 2.9, FACADE_Z);
	for (const x of [-2.2, 2.2]) kit.box(0.5, 5.8, 0.66, stone, x, 2.9, FACADE_Z);
	kit.box(8.9, 0.3, 0.8, stone, 0, 5.9, FACADE_Z);
	// Rose window, great door and the steps before it.
	kit.piece(new THREE.CircleGeometry(0.95, 28), kit.solid(CUENCA.glass, 0.4, 0, CUENCA.glass, 0.45), 0, 4.0, FACADE_Z - 0.31, 0, Math.PI, 0);
	kit.piece(new THREE.TorusGeometry(1.0, 0.09, 6, 28), stone, 0, 4.0, FACADE_Z - 0.32);
	kit.box(1.8, 2.7, 0.1, kit.solid(WOOD.logDark, 0.8), 0, 1.35, FACADE_Z - 0.32);
	kit.box(4.2, 0.18, 1.0, kit.solid(STONE.light, 0.9), 0, 0.09, FACADE_Z - 0.8);
	// Two towers that stop short: the foundations could not have carried them any higher.
	for (const side of [-1, 1]) {
		kit.box(2.0, 7.2, 2.0, brick, side * 4.6, 3.6, FACADE_Z + 0.3);
		kit.box(2.3, 0.3, 2.3, stone, side * 4.6, 7.35, FACADE_Z + 0.3);
		kit.box(1.5, 0.8, 1.5, stone, side * 4.6, 7.9, FACADE_Z + 0.3);
		kit.walls(side * 4.6, FACADE_Z + 0.3, 2.0, 2.0);
	}
	kit.walls(0, navZ, NAVE.w, NAVE.d);
	kit.walls(0, FACADE_Z, 8.6, 0.6);

	// The three domes: drums of stone, glazed tile, a lantern and a gilded finial on each.
	const tiles = kit.face(domeTiles(), { roughness: 0.3, metalness: 0.15, emissive: CUENCA.domeBlue, emissiveIntensity: 0.22 });
	const gilt = kit.solid(STONE.gold, 0.3, 0.8, STONE.gold, 0.4);
	// Tall drums lift the domes clear of the facade, so they crown the view from the plaza as they do the city.
	for (const [x, z, r] of [
		[0, navZ + 1.6, 2.3],
		[-2.3, FACADE_Z + 2.0, 1.4],
		[2.3, FACADE_Z + 2.0, 1.4]
	]) {
		const drum = r;
		kit.cyl(r * 0.96, r, drum, stone, x, NAVE.h + drum / 2, z, 24);
		kit.piece(dome(r), tiles, x, NAVE.h + drum, z);
		kit.cyl(r * 0.16, r * 0.18, r * 0.45, stone, x, NAVE.h + drum + r + r * 0.2, z, 10);
		kit.piece(new THREE.SphereGeometry(r * 0.1, 10, 8), gilt, x, NAVE.h + drum + r * 1.5, z);
	}
}

function lamp(kit: Kit, x: number, z: number): void {
	const y0 = kit.ground(x, z);
	const iron = kit.solid(STONE.iron, 0.5, 0.6);
	kit.cyl(0.05, 0.07, 3.2, iron, x, y0 + 1.6, z, 8);
	kit.box(0.3, 0.42, 0.3, kit.solid(CUENCA.glass, 0.4, 0, CUENCA.glass, 2.2), x, y0 + 3.35, z);
	kit.box(0.38, 0.06, 0.38, iron, x, y0 + 3.6, z);
	kit.pillar(x, z, 0.15);
}

export function buildCuenca(landmark: PlacedLandmark, ctx: KitContext): Site {
	const kit = new Kit('cuenca', landmark.spot, ctx);
	const plaza = kit.face(bricks(1557, CUENCA.plaza, CUENCA.brickDark, [7, 7]), { roughness: 0.95 });
	kit.piece(new THREE.CircleGeometry(9.6, 48), plaza, 0, 0.02, -1.5, -Math.PI / 2);
	cathedral(kit);
	for (const [x, z] of [
		[-6.6, -6.2],
		[6.6, -6.2],
		[-7.4, 1.2],
		[7.4, 1.2]
	]) lamp(kit, x, z);

	// Deportivo Cuenca: a goal on the plaza's west side, a ball on the spot, the club's banner.
	const netting = kit.face(netMesh(CUENCA.goal), { transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 });
	goal(kit, kit.solid(CUENCA.goal, 0.5), netting, -6.2, -2.4, -Math.PI / 2, 0.02, { w: 3.66, h: 1.8, d: 1.3, bar: 0.05 });
	kit.piece(new THREE.SphereGeometry(0.11, 20, 14), kit.face(soccerBall(), { roughness: 0.6 }), -3.4, 0.13, -2.1, 0.4, 0.8, 0);
	const club = paintedBoard(['DEPORTIVO CUENCA', 'EL EXPRESO AUSTRAL · DESDE 1971'], { ground: CUENCA.red, ink: CUENCA.yellow, border: CUENCA.ink, w: 1024, h: 340 });
	kit.sign(club, -5.4, -7.4, { ry: 0.45, w: 2.6, h: 0.86, post: 1.2, tidbit: 'deportivo-cuenca' });

	// The city's colours, red over yellow, on a tall pole.
	const pole = kit.solid(STONE.iron, 0.5, 0.6);
	kit.cyl(0.06, 0.08, 6.4, pole, 5.4, 3.2, -4.4, 8);
	kit.box(1.3, 0.06, 0.06, pole, 6.05, 6.2, -4.4);
	kit.cloth(gonfalon(CUENCA.red, CUENCA.yellow), 1.05, 2.1, 6.1, 5.1, -4.4, 0, 0.7);
	kit.pillar(5.4, -4.4, 0.2);

	const sign = paintedBoard(['CUENCA', 'ECUADOR'], { ground: CUENCA.domeBlue, ink: CUENCA.domeWhite, border: CUENCA.domeWhite, w: 512, h: 170 });
	kit.sign(sign, 2.6, -8.6, { ry: -0.25, w: 1.6, h: 0.53, tidbit: 'cuenca-domes' });
	return kit.build();
}
