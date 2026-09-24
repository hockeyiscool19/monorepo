// NREL, Golden: rows of solar panels tilted towards the square with walkable aisles between them, and behind them a
// wind turbine taller than any gate, its rotor turning (held still under reduced motion) and a red beacon blinking
// on its nacelle.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlacedLandmark } from '../../../domain/realm';
import { NREL, STONE } from '../../palette';
import { paintedBoard, solarCells } from '../../textures/landmarks';
import { Kit, type KitContext, type Site } from './kit';

const ROWS = [-3.4, 0.8, 5.0];
const TABLES = [-8, -4, 0, 4, 8];
const PANEL = { w: 3.4, d: 1.9, tilt: 0.45, y: 1.3 };
const TURBINE = { z: 15, hub: 26, blade: 13 };

function solarField(kit: Kit): void {
	const panel = kit.face(solarCells(), { metalness: 0.5, roughness: 0.28 });
	const steel = kit.solid(NREL.frame, 0.5, 0.6);
	const drop = Math.sin(PANEL.tilt) * (PANEL.d / 2);
	for (const z of ROWS) {
		for (const x of TABLES) {
			const y0 = kit.ground(x, z);
			// Tilted up towards local −z, where the square is.
			kit.box(PANEL.w, 0.06, PANEL.d, panel, x, y0 + PANEL.y, z, 0, -PANEL.tilt);
			// Legs from the ground up to the panel's low front edge and its high back edge.
			for (const side of [-1, 1]) {
				for (const [leg, dz] of [
					[PANEL.y - drop, -0.8],
					[PANEL.y + drop, 0.8]
				]) kit.box(0.08, leg, 0.08, steel, x + side * 1.4, y0 + leg / 2, z + dz);
			}
			kit.walls(x, z, PANEL.w, 1.8);
		}
	}
}

/** Three tapered blades around the hub, merged into one mesh that turns about its axis (local z). */
function rotor(kit: Kit): THREE.Group {
	const shape = new THREE.Shape([
		new THREE.Vector2(-0.35, 0),
		new THREE.Vector2(0.55, 0.5),
		new THREE.Vector2(0.75, 3.2),
		new THREE.Vector2(0.28, TURBINE.blade),
		new THREE.Vector2(-0.05, TURBINE.blade),
		new THREE.Vector2(-0.4, 2.4)
	]);
	const blades = [0, 1, 2].map((i) => {
		const g = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
		g.translate(0, 0.6, -0.08);
		g.rotateY(0.12);
		g.rotateZ((i * Math.PI * 2) / 3);
		return g;
	});
	const merged = kit.keep(mergeGeometries(blades, false) ?? blades[0]);
	for (const g of blades) if (g !== merged) g.dispose();
	const group = new THREE.Group();
	const white = kit.solid(NREL.blade, 0.45, 0.1);
	const mesh = new THREE.Mesh(merged, white);
	mesh.castShadow = kit.shadows;
	group.add(mesh);
	const spinner = new THREE.Mesh(kit.keep(new THREE.SphereGeometry(0.8, 16, 12)), white);
	spinner.scale.set(1, 1, 1.4);
	group.add(spinner);
	return group;
}

export function buildNrel(landmark: PlacedLandmark, ctx: KitContext): Site {
	const kit = new Kit('nrel', landmark.spot, ctx);
	solarField(kit);

	const tower = kit.solid(NREL.tower, 0.55, 0.1);
	const y0 = kit.ground(0, TURBINE.z);
	kit.cyl(0.55, 1.05, TURBINE.hub, tower, 0, y0 + TURBINE.hub / 2, TURBINE.z, 20);
	kit.cyl(1.6, 1.8, 0.6, kit.solid(STONE.mid, 0.9), 0, y0 + 0.3, TURBINE.z, 20);
	kit.box(2.0, 1.8, 4.2, tower, 0, y0 + TURBINE.hub + 0.5, TURBINE.z + 0.4);
	kit.pillar(0, TURBINE.z, 1.9);
	const blades = rotor(kit);
	kit.add(blades, 0, y0 + TURBINE.hub + 0.5, TURBINE.z - 2.2);
	const beacon = kit.keep(new THREE.MeshStandardMaterial({ color: NREL.beacon, emissive: new THREE.Color(NREL.beacon), emissiveIntensity: 3 }));
	kit.add(new THREE.Mesh(kit.keep(new THREE.SphereGeometry(0.16, 10, 8)), beacon), 0, y0 + TURBINE.hub + 1.55, TURBINE.z + 1.4);

	const sign = paintedBoard(['NREL', 'GOLDEN, COLORADO · SOUTH TABLE MOUNTAIN'], { ground: NREL.badge, ink: NREL.blade, border: NREL.frame, w: 512, h: 170 });
	kit.sign(sign, -3.4, -8.2, { ry: 0.25, w: 1.7, h: 0.56, tidbit: 'nrel' });

	kit.onUpdate((t) => {
		blades.rotation.z = -t * 0.9;
		// A slow blink; frozen time leaves it lit.
		beacon.emissiveIntensity = t % 2 < 1 ? 3 : 0.3;
	});
	return kit.build();
}
