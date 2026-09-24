// Keepsakes of the Jarl's story in My Get-a-way. By the window: a Green Mountain painting, a Burr and Burton pennant,
// two hockey sticks crossed over the glass, and on the sill a jug of maple syrup and a little solar panel with an
// NREL badge. Round the room: a jersey with number 19, a Davidson pennant over the armchair, a match ball on the
// floor, a Deportivo Cuenca scarf over the door, a poster of Cuenca, and a red model car and a puck on the shelf.
// Every one is a tidbit: E reads it.

import * as THREE from 'three';
import { pillar, type Capsule } from '../../domain/collide';
import { CUENCA, DAVIDSON, GETAWAY, JERSEY, RINK, TESLA, VERMONT, WOOD } from '../palette';
import type { Interactable } from '../space';
import { jersey, pennant, scarf } from '../textures/cloth';
import { cuencaPoster, nrelBadge, syrupLabel, vermontPainting } from '../textures/keepsakes';
import { soccerBall, solarCells } from '../textures/landmarks';
import { BODY, extrude, GLASS } from '../overworld/landmarks/tesla';

export interface Keepsakes {
	group: THREE.Group;
	colliders: Capsule[];
	interactables: Interactable[];
	dispose(): void;
}

/** Where each keepsake is read from: its point on the floor plan, its height, and how close you must stand. */
const SPOTS: [id: string, x: number, z: number, y: number, radius: number][] = [
	['vermont-painting', -2.3, -2.5, 1.45, 1.9],
	['bba-pennant', -3, -1.9, 2.0, 1.9],
	['hockey-sticks', 0.2, -2.5, 2.55, 2.2],
	['maple-syrup', -0.95, -2.4, 0.95, 1.6],
	['desk-solar', 0.35, -2.4, 0.95, 1.6],
	['jersey-19', -0.95, 2.5, 1.6, 1.9],
	['davidson-pennant', -3, 1.9, 2.05, 1.9],
	['match-ball', -1.7, 0.95, 0.11, 1.6],
	['cuenca-scarf', 1.6, 2.5, 2.36, 1.8],
	['cuenca-poster', 3, -0.5, 1.5, 1.8],
	['model-car', 2.85, 1.25, 1.86, 1.7]
];

export function buildKeepsakes(castShadows: boolean): Keepsakes {
	const group = new THREE.Group();
	group.name = 'keepsakes';
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
	const add = <T extends THREE.Object3D>(object: T, x: number, y: number, z: number, parent: THREE.Object3D = group): T => {
		object.position.set(x, y, z);
		object.traverse((o) => {
			if ((o as THREE.Mesh).isMesh) o.castShadow = castShadows;
		});
		parent.add(object);
		return object;
	};
	const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => new THREE.Mesh(keep(geometry), material);
	const solid = (color: number, roughness = 0.8, metalness = 0) => keep(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
	const printed = (texture: THREE.Texture, cutout = false) =>
		keep(new THREE.MeshStandardMaterial({ map: keep(texture), roughness: 0.85, transparent: cutout, alphaTest: cutout ? 0.5 : 0, side: cutout ? THREE.DoubleSide : THREE.FrontSide }));
	const frame = solid(GETAWAY.frame, 0.7);
	const dowel = solid(WOOD.plank, 0.7);

	// The Green Mountain painting, left of the window, under the Colorado pennant.
	add(mesh(new THREE.BoxGeometry(0.8, 0.62, 0.04), frame), -2.3, 1.45, -2.48);
	add(mesh(new THREE.PlaneGeometry(0.72, 0.54), printed(vermontPainting())), -2.3, 1.45, -2.457);

	// Pennants on the west wall either side of the cork board, facing into the room with their points to the north,
	// a dowel through each sleeve.
	for (const [z, texture] of [
		[-1.9, pennant('BURR AND BURTON', 'BULLDOGS · VERMONT', VERMONT.bbaGreen, VERMONT.bbaGold, VERMONT.bbaGold)],
		[1.9, pennant('DAVIDSON', 'WILDCATS', DAVIDSON.red, DAVIDSON.column, DAVIDSON.ink)]
	] as const) {
		const y = z < 0 ? 2.0 : 2.05;
		add(mesh(new THREE.PlaneGeometry(0.96, 0.36), printed(texture, true)), -2.975, y, z).rotation.y = Math.PI / 2;
		add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 6), dowel), -2.97, y, z + 0.48);
	}

	// Two hockey sticks crossed over the window, blades taped.
	const shaft = solid(RINK.stick, 0.55);
	const tape = solid(RINK.tape, 0.9);
	const grip = solid(GETAWAY.paper, 0.9);
	for (const side of [1, -1]) {
		const stick = new THREE.Group();
		add(mesh(new THREE.BoxGeometry(1.5, 0.03, 0.022), shaft), 0, 0, 0, stick);
		const blade = add(mesh(new THREE.BoxGeometry(0.3, 0.075, 0.014), tape), 0.86, -0.07, 0, stick);
		blade.rotation.z = -0.55;
		add(mesh(new THREE.BoxGeometry(0.12, 0.034, 0.026), grip), -0.7, 0, 0, stick);
		stick.scale.x = side;
		stick.rotation.z = side * 0.13;
		add(stick, 0.2, 2.55, -2.47);
	}

	// On the sill: a jug of maple syrup, and a little solar panel in the sun with an NREL badge leaning on it.
	const sill = 0.865;
	add(mesh(new THREE.BoxGeometry(0.12, 0.17, 0.07), keep(new THREE.MeshStandardMaterial({ color: VERMONT.syrup, roughness: 0.15, metalness: 0.1 }))), -0.95, sill + 0.085, -2.4);
	add(mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.05, 10), solid(VERMONT.syrup, 0.2)), -0.95, sill + 0.195, -2.4);
	add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.022, 10), solid(VERMONT.trim, 0.6)), -0.95, sill + 0.23, -2.4);
	add(mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), solid(VERMONT.syrup, 0.2)), -0.9, sill + 0.15, -2.4).rotation.y = Math.PI / 2;
	add(mesh(new THREE.PlaneGeometry(0.1, 0.1), printed(syrupLabel())), -0.95, sill + 0.085, -2.364);
	add(mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), solid(TESLA.trim, 0.6, 0.4)), 0.35, sill + 0.035, -2.42);
	const panel = add(mesh(new THREE.PlaneGeometry(0.3, 0.2), keep(new THREE.MeshStandardMaterial({ map: keep(solarCells(7)), metalness: 0.5, roughness: 0.3 }))), 0.35, sill + 0.085, -2.42);
	// Mostly face up in the sun on the sill, tipped 25° towards the room so its cells show.
	panel.rotation.x = -(Math.PI / 2 - 0.44);
	const badge = add(mesh(new THREE.PlaneGeometry(0.07, 0.105), printed(nrelBadge())), 0.53, sill + 0.052, -2.33);
	badge.rotation.set(-0.25, -0.2, 0);

	// The jersey on a hanger rod, above the side table.
	add(mesh(new THREE.PlaneGeometry(0.95, 0.95), printed(jersey('JARL', '19', JERSEY.body, JERSEY.stripe, JERSEY.trim), true)), -0.95, 1.6, 2.475).rotation.y = Math.PI;
	add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8), dowel), -0.95, 2.07, 2.46).rotation.z = Math.PI / 2;

	// A match ball by the armchair, the supporters' scarf over the door, and the poster of Cuenca.
	add(mesh(new THREE.SphereGeometry(0.11, 20, 14), printed(soccerBall())), -1.7, 0.11, 0.95).rotation.set(0.4, 0.9, 0);
	add(mesh(new THREE.PlaneGeometry(1.3, 0.16), printed(scarf('DEPORTIVO CUENCA', [CUENCA.red, CUENCA.yellow, CUENCA.ink], CUENCA.red, CUENCA.yellow), true)), 1.6, 2.36, 2.475).rotation.y = Math.PI;
	add(mesh(new THREE.BoxGeometry(0.03, 0.68, 0.52), frame), 2.985, 1.5, -0.5);
	add(mesh(new THREE.PlaneGeometry(0.48, 0.64), printed(cuencaPoster())), 2.968, 1.5, -0.5).rotation.y = -Math.PI / 2;

	// A red model car and a puck on top of the bookshelf.
	const model = new THREE.Group();
	const paint = solid(TESLA.paint, 0.3, 0.3);
	const glass = solid(TESLA.glass, 0.1, 0.6);
	add(mesh(extrude(BODY, 1.74, 0.05), paint), 0, 0, 0, model);
	add(mesh(extrude(GLASS, 1.48, 0.06), glass), 0, 0, 0, model);
	const wheel = solid(TESLA.tyre, 0.9);
	for (const x of [-1.45, 1.45]) {
		for (const z of [-0.86, 0.86]) add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 16), wheel), x, 0.36, z, model).rotation.x = Math.PI / 2;
	}
	model.scale.setScalar(0.075);
	model.rotation.y = Math.PI / 2;
	add(model, 2.83, 1.8, 1.25);
	add(mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.025, 16), solid(RINK.puck, 0.6)), 2.83, 1.8125, 0.72);

	return {
		group,
		colliders: [pillar(-1.7, 0.95, 0.12)],
		interactables: SPOTS.map(([id, x, z, y, radius]) => ({ id: `tidbit:${id}`, kind: 'tidbit' as const, x, z, radius, y })),
		dispose() {
			for (const d of disposables) d.dispose();
		}
	};
}
