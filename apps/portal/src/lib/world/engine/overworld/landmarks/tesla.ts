// The Eisenhold Supercharger, by the south road: four red-and-white stalls on a cleared pad, and a red sedan backed
// into stall two with its cable in and its charge port pulsing green. It has been at 80% since the realm was raised.

import * as THREE from 'three';
import type { PlacedLandmark } from '../../../domain/realm';
import { NIGHT, STONE, TESLA } from '../../palette';
import { paintedBoard, stallFace } from '../../textures/landmarks';
import { Kit, type KitContext, type Site } from './kit';

const STALLS = [-3.75, -1.25, 1.25, 3.75];
const POST_Z = 3.7;
/** The car's centre in stall two, and its length and width. */
const CAR = { x: -1.25, z: 0.85, length: 4.7, width: 1.84 };

/** Side profile of a fastback sedan below the beltline, rear to front (x along the car, y up). Also the model in the room. */
export const BODY: [number, number][] = [
	[-2.35, 0.36], [-2.38, 0.62], [-2.3, 0.88], [-2.05, 0.98], [-1.6, 1.0], [1.25, 1.0], [1.95, 0.9], [2.3, 0.72], [2.36, 0.5], [2.25, 0.34]
];
/** The glass: rear window, a glass roof and the windshield. */
export const GLASS: [number, number][] = [[-1.62, 0.98], [-0.7, 1.42], [0.45, 1.44], [1.3, 0.98]];

export function extrude(points: [number, number][], depth: number, bevel: number): THREE.BufferGeometry {
	const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
	const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
	geometry.translate(0, 0, -depth / 2);
	return geometry;
}

/** The car, backed in: its front faces the road (local −z). Car frame: x forward, y up, z to its right. */
function car(kit: Kit): THREE.MeshStandardMaterial {
	const at = (cx: number, cz: number) => [CAR.x + cz, CAR.z - cx] as const;
	const paintMat = kit.solid(TESLA.paint, 0.32, 0.3);
	kit.piece(extrude(BODY, CAR.width - 0.1, 0.05), paintMat, CAR.x, 0, CAR.z, 0, Math.PI / 2, 0);
	kit.piece(extrude(GLASS, CAR.width - 0.36, 0.06), kit.solid(TESLA.glass, 0.12, 0.6), CAR.x, 0, CAR.z, 0, Math.PI / 2, 0);
	// A dusting of snow on the glass roof.
	kit.box(1.0, 0.035, 1.25, kit.solid(NIGHT.snow, 0.9), CAR.x, 1.47, CAR.z + 0.1);
	const tyre = kit.solid(TESLA.tyre, 0.9);
	const rim = kit.solid(TESLA.rim, 0.4, 0.7);
	for (const cx of [-1.45, 1.45]) {
		for (const side of [-1, 1]) {
			const [x, z] = at(cx, side * 0.86);
			kit.cyl(0.36, 0.36, 0.24, tyre, x, 0.36, z, 20, 0, Math.PI / 2);
			kit.cyl(0.25, 0.25, 0.25, rim, x + side * 0.004, 0.36, z, 14, 0, Math.PI / 2);
		}
	}
	const head = kit.solid(TESLA.head, 0.4, 0, TESLA.head, 2.4);
	const tail = kit.solid(TESLA.tail, 0.4, 0, TESLA.tail, 2.2);
	for (const side of [-1, 1]) {
		const [hx, hz] = at(2.37, side * 0.6);
		kit.box(0.42, 0.07, 0.05, head, hx, 0.64, hz);
		const [tx, tz] = at(-2.36, side * 0.58);
		kit.box(0.5, 0.07, 0.05, tail, tx, 0.86, tz);
	}
	// The charge port, rear left, pulsing green while it charges.
	const port = kit.keep(new THREE.MeshStandardMaterial({ color: TESLA.port, emissive: new THREE.Color(TESLA.port), emissiveIntensity: 2.2 }));
	const [px, pz] = at(-1.98, -0.97);
	kit.box(0.08, 0.1, 0.14, port, px, 0.86, pz);
	// The cable, from the stall's side, sagging down and up into the port.
	const curve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(CAR.x - 0.19, 1.1, POST_Z - 0.05),
		new THREE.Vector3(CAR.x - 0.55, 0.42, POST_Z - 0.35),
		new THREE.Vector3(px - 0.1, 0.55, pz + 0.35),
		new THREE.Vector3(px - 0.05, 0.86, pz + 0.02)
	]);
	kit.piece(new THREE.TubeGeometry(curve, 24, 0.024, 6), kit.solid(TESLA.trim, 0.6), 0, 0, 0);
	kit.walls(CAR.x, CAR.z, CAR.width + 0.2, CAR.length + 0.1);
	kit.tidbit('charging-car', CAR.x, CAR.z, 1.0, 3.4);
	return port;
}

export function buildSupercharger(landmark: PlacedLandmark, ctx: KitContext): Site {
	const kit = new Kit('supercharger', landmark.spot, ctx);
	kit.box(10.4, 0.04, 7.8, kit.solid(TESLA.pad, 0.95), 0, 0, 0.6);
	const line = kit.solid(TESLA.line, 0.8);
	for (const x of [-5, -2.5, 0, 2.5, 5]) kit.box(0.08, 0.01, 4.8, line, x, 0.024, 1.1);

	const face = stallFace();
	kit.keep(face.glow);
	const stall = kit.face(face.map, { emissiveMap: face.glow, emissive: new THREE.Color(TESLA.stallRed), emissiveIntensity: 1.8, roughness: 0.5 });
	const trim = kit.solid(TESLA.trim, 0.5, 0.2);
	const plinth = kit.solid(STONE.mid, 0.9);
	for (const x of STALLS) {
		kit.box(0.5, 0.12, 0.42, plinth, x, 0.12, POST_Z);
		kit.box(0.34, 1.9, 0.26, stall, x, 1.12, POST_Z);
		kit.box(0.36, 0.05, 0.28, trim, x, 2.09, POST_Z);
		kit.pillar(x, POST_Z, 0.32);
		if (x === CAR.x) continue;
		// A holstered cable, looped on the stall's side.
		const loop = new THREE.CatmullRomCurve3([
			new THREE.Vector3(x - 0.19, 1.1, POST_Z - 0.05),
			new THREE.Vector3(x - 0.3, 0.55, POST_Z - 0.16),
			new THREE.Vector3(x - 0.21, 0.82, POST_Z - 0.14)
		]);
		kit.piece(new THREE.TubeGeometry(loop, 12, 0.024, 6), trim, 0, 0, 0);
	}
	const port = car(kit);

	const sign = paintedBoard(['⚡ SUPERCHARGER', 'EISENHOLD · OPEN ALL NIGHT'], { ground: TESLA.stall, ink: TESLA.trim, border: TESLA.stallRed, w: 512, h: 170 });
	kit.sign(sign, 5.9, -3.3, { w: 1.7, h: 0.56, tidbit: 'supercharger' });

	kit.onUpdate((t) => {
		port.emissiveIntensity = 1.2 + 1.2 * (0.5 + 0.5 * Math.sin(t * 2.4));
	});
	return kit.build();
}
