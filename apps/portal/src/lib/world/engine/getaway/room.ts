// My Get-a-way, inside: a compact log room (6 × 5 m) with a picture window onto Colorado, the drafting
// table under the window light, the cork board on the west wall, a wood stove, an armchair with a
// blanket and a steaming mug, a bookshelf, skis in the corner, a Colorado pennant and a postcard by the door —
// and the keepsakes of the Jarl's story all round the walls (keepsakes.ts).

import * as THREE from 'three';
import { box as boxWalls, pillar, type Capsule } from '../../domain/collide';
import { rng } from '../noise';
import { COLORADO, FIRE, GETAWAY, STONE, WOOD } from '../palette';
import { fire as fireParticles, smoke, type Particles } from '../particles';
import { clothFragment, clothVertex } from '../shaders';
import type { Interactable } from '../space';
import { softDot } from '../textures/common';
import { bookSpines, coloradoPennant, postcard, rug, wood } from '../textures/room';
import { buildBoards, CORK, type Boards } from './board3d';
import { buildKeepsakes } from './keepsakes';

export const ROOM = { w: 6, d: 5, h: 2.8 };
export const WINDOW = { w: 3.0, bottom: 0.85, top: 2.3 };

export interface Room {
	group: THREE.Group;
	boards: Boards;
	colliders: Capsule[];
	interactables: Interactable[];
	lights: { stove: THREE.PointLight; bulb: THREE.PointLight };
	update(t: number): void;
	dispose(): void;
}

export function buildRoom(pixelRatio: number, castShadows: boolean): Room {
	const group = new THREE.Group();
	group.name = 'getaway-room';
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
	const particles: Particles[] = [];
	const { w, d, h } = ROOM;
	const add = (mesh: THREE.Mesh, x: number, y: number, z: number, cast = true) => {
		mesh.position.set(x, y, z);
		mesh.castShadow = cast && castShadows;
		mesh.receiveShadow = true;
		group.add(mesh);
		return mesh;
	};
	const boxMesh = (bw: number, bh: number, bd: number, mat: THREE.Material) => new THREE.Mesh(keep(new THREE.BoxGeometry(bw, bh, bd)), mat);

	// Shell: log walls, plank floor, beamed ceiling. The north wall frames the window.
	const logMat = keep(new THREE.MeshStandardMaterial({ map: keep(wood(71, 'logs', GETAWAY.logWall, GETAWAY.logWallDark, [2, 1.3])), roughness: 0.85 }));
	const t = 0.24;
	add(boxMesh(w + t * 2, h, t, logMat), 0, h / 2, d / 2 + t / 2);
	add(boxMesh(t, h, d, logMat), -w / 2 - t / 2, h / 2, 0);
	add(boxMesh(t, h, d, logMat), w / 2 + t / 2, h / 2, 0);
	const side = (w - WINDOW.w) / 2;
	add(boxMesh(side + t, h, t, logMat), -w / 2 - t + (side + t) / 2, h / 2, -d / 2 - t / 2);
	add(boxMesh(side + t, h, t, logMat), w / 2 + t - (side + t) / 2, h / 2, -d / 2 - t / 2);
	add(boxMesh(WINDOW.w, WINDOW.bottom, t, logMat), 0, WINDOW.bottom / 2, -d / 2 - t / 2);
	add(boxMesh(WINDOW.w, h - WINDOW.top, t, logMat), 0, (h + WINDOW.top) / 2, -d / 2 - t / 2);
	const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), keep(new THREE.MeshStandardMaterial({ map: keep(wood(17, 'boards', GETAWAY.floor, GETAWAY.floorDark, [2.2, 1.8])), roughness: 0.75 })));
	floor.rotation.x = -Math.PI / 2;
	add(floor, 0, 0, 0, false);
	const ceiling = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), keep(new THREE.MeshStandardMaterial({ color: GETAWAY.ceiling, roughness: 0.9 })));
	ceiling.rotation.x = Math.PI / 2;
	add(ceiling, 0, h, 0, false);
	const beamMat = keep(new THREE.MeshStandardMaterial({ color: GETAWAY.logWallDark, roughness: 0.85 }));
	for (const z of [-1.5, 0, 1.5]) add(boxMesh(w, 0.18, 0.2, beamMat), 0, h - 0.09, z);

	// The window: frame, cross mullions, a deep sill with a potted plant, and faint glass.
	const frameMat = keep(new THREE.MeshStandardMaterial({ color: GETAWAY.frame, roughness: 0.7 }));
	const wz = -d / 2 - 0.02;
	const midY = (WINDOW.bottom + WINDOW.top) / 2;
	add(boxMesh(WINDOW.w + 0.16, 0.1, 0.12, frameMat), 0, WINDOW.top + 0.03, wz);
	add(boxMesh(WINDOW.w + 0.3, 0.07, 0.34, frameMat), 0, WINDOW.bottom - 0.02, wz + 0.1);
	for (const x of [-WINDOW.w / 2, WINDOW.w / 2, 0]) add(boxMesh(x === 0 ? 0.06 : 0.1, WINDOW.top - WINDOW.bottom, 0.1, frameMat), x, midY, wz);
	add(boxMesh(WINDOW.w, 0.05, 0.08, frameMat), 0, midY + 0.2, wz);
	const glass = new THREE.Mesh(keep(new THREE.PlaneGeometry(WINDOW.w, WINDOW.top - WINDOW.bottom)), keep(new THREE.MeshStandardMaterial({ color: COLORADO.skyHorizon, transparent: true, opacity: 0.05, roughness: 0.05, metalness: 0.2 })));
	add(glass, 0, midY, wz - 0.04, false);
	add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.09, 0.07, 0.14, 12)), keep(new THREE.MeshStandardMaterial({ color: GETAWAY.rugRed, roughness: 0.8 }))), 1.05, WINDOW.bottom + 0.08, wz + 0.14);
	const leafMat = keep(new THREE.MeshStandardMaterial({ color: GETAWAY.couch, roughness: 0.8, flatShading: true }));
	const leafRand = rng(8);
	for (let i = 0; i < 7; i++) {
		const leaf = new THREE.Mesh(keep(new THREE.ConeGeometry(0.03, 0.22, 4)), leafMat);
		leaf.position.set(1.05 + (leafRand() - 0.5) * 0.08, WINDOW.bottom + 0.24, wz + 0.14 + (leafRand() - 0.5) * 0.08);
		leaf.rotation.set((leafRand() - 0.5) * 0.9, 0, (leafRand() - 0.5) * 0.9);
		group.add(leaf);
	}

	// Colorado pennant above the window, barely stirring.
	const pennantMat = keep(
		new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uWind: { value: 0.12 }, uMap: { value: keep(coloradoPennant()) }, uTint: { value: new THREE.Color(1, 1, 1) } }]),
			vertexShader: clothVertex,
			fragmentShader: clothFragment,
			side: THREE.DoubleSide,
			fog: true
		})
	);
	const pennant = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.1, 0.42, 8, 2)), pennantMat);
	add(pennant, -2.1, 2.45, -d / 2 + 0.02, false);

	// Rug.
	const rugMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.7, 1.9)), keep(new THREE.MeshStandardMaterial({ map: keep(rug()), roughness: 1 })));
	rugMesh.rotation.x = -Math.PI / 2;
	add(rugMesh, -0.2, 0.004, 0.35, false);

	// Boards: the cork board on the west wall, the drafting table under the window's light.
	const boards = buildBoards();
	boards.corkGroup.position.set(-w / 2 + 0.03, CORK.y, 0);
	boards.corkGroup.rotation.y = Math.PI / 2;
	group.add(boards.corkGroup);
	boards.tableGroup.position.set(1.75, 0, -1.15);
	boards.tableGroup.rotation.y = Math.PI / 2 + 0.25;
	group.add(boards.tableGroup);
	const lamp = new THREE.SpotLight(GETAWAY.lamp, 3.2, 4, 0.7, 0.6, 1.5);
	lamp.position.set(1.4, 2.0, -1.2);
	lamp.target.position.set(1.75, 0.9, -1.15);
	group.add(lamp, lamp.target);
	add(new THREE.Mesh(keep(new THREE.ConeGeometry(0.13, 0.16, 16, 1, true)), keep(new THREE.MeshStandardMaterial({ color: STONE.iron, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }))), 1.4, 2.08, -1.2);

	// Wood stove in the north-east corner.
	const ironMat = keep(new THREE.MeshStandardMaterial({ color: GETAWAY.stoveIron, roughness: 0.5, metalness: 0.6 }));
	add(boxMesh(0.6, 0.62, 0.52, ironMat), 2.45, 0.42, -1.95);
	add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 10)), ironMat), 2.45, 1.63, -2.05);
	const stoveGlow = add(new THREE.Mesh(keep(new THREE.PlaneGeometry(0.3, 0.2)), keep(new THREE.MeshStandardMaterial({ color: FIRE.flame, emissive: new THREE.Color(FIRE.flame), emissiveIntensity: 2.4 }))), 2.14, 0.42, -1.95, false);
	stoveGlow.rotation.y = -Math.PI / 2;
	const embers = fireParticles({ count: 16, seed: 12, radius: 0.1, height: 0.18, size: 30, core: new THREE.Color(FIRE.core), flame: new THREE.Color(FIRE.flame), ember: new THREE.Color(FIRE.ember), pixelRatio });
	embers.points.position.set(2.1, 0.32, -1.95);
	group.add(embers.points);
	particles.push(embers);
	const stoveLight = new THREE.PointLight(FIRE.light, 3.2, 5, 1.6);
	stoveLight.position.set(1.95, 0.55, -1.9);
	group.add(stoveLight);

	// Armchair with a blanket, side table and a steaming mug, in the south-west corner.
	const couchMat = keep(new THREE.MeshStandardMaterial({ color: GETAWAY.couch, roughness: 0.95 }));
	const chair = new THREE.Group();
	chair.position.set(-2.05, 0, 1.55);
	chair.rotation.y = Math.PI * 0.8;
	group.add(chair);
	const chairPart = (bw: number, bh: number, bd: number, x: number, y: number, z: number, mat = couchMat) => {
		const mesh = boxMesh(bw, bh, bd, mat);
		mesh.position.set(x, y, z);
		mesh.castShadow = castShadows;
		chair.add(mesh);
	};
	chairPart(0.9, 0.42, 0.85, 0, 0.21, 0);
	chairPart(0.9, 0.7, 0.2, 0, 0.72, 0.34);
	chairPart(0.16, 0.3, 0.85, -0.45, 0.55, 0);
	chairPart(0.16, 0.3, 0.85, 0.45, 0.55, 0);
	chairPart(0.7, 0.04, 0.7, 0.05, 0.44, -0.05, keep(new THREE.MeshStandardMaterial({ color: GETAWAY.blanket, roughness: 1 })));
	const tableMat = keep(new THREE.MeshStandardMaterial({ color: GETAWAY.floorDark, roughness: 0.7 }));
	add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 20)), tableMat), -1.15, 0.58, 2.0);
	add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.06, 0.56, 8)), tableMat), -1.15, 0.28, 2.0);
	add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14)), keep(new THREE.MeshStandardMaterial({ color: GETAWAY.paper, roughness: 0.4 }))), -1.12, 0.65, 1.98);
	const steam = smoke({ count: 10, height: 0.5, drift: 0.06, spread: 0.04, color: new THREE.Color(GETAWAY.paper), pixelRatio: pixelRatio * 0.06, map: keep(softDot(64, 0.05)) });
	steam.points.position.set(-1.12, 0.71, 1.98);
	group.add(steam.points);
	particles.push(steam);

	// Bookshelf on the east wall, skis in the south-east corner.
	add(boxMesh(0.32, 1.8, 1.3, tableMat), w / 2 - 0.17, 0.9, 1.25);
	const spines = keep(bookSpines(9));
	for (const y of [0.35, 0.85, 1.35]) {
		add(boxMesh(0.3, 0.03, 1.26, tableMat), w / 2 - 0.2, y - 0.2, 1.25, false);
		const books = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.2, 0.36)), keep(new THREE.MeshStandardMaterial({ map: spines, roughness: 0.8, transparent: true })));
		books.rotation.y = -Math.PI / 2;
		add(books, w / 2 - 0.34, y, 1.25, false);
	}
	const skiMat = keep(new THREE.MeshStandardMaterial({ color: GETAWAY.rugBlue, roughness: 0.5 }));
	for (const dx of [0, 0.14]) {
		const ski = add(boxMesh(0.09, 1.75, 0.02, skiMat), w / 2 - 0.25 - dx, 0.88, d / 2 - 0.22);
		ski.rotation.z = 0.12;
	}

	// Door and a framed postcard beside it.
	const door = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.0, 2.1)), keep(new THREE.MeshStandardMaterial({ map: keep(wood(29, 'boards', WOOD.plank, WOOD.plankDark, [1, 1])), roughness: 0.8 })));
	door.rotation.y = Math.PI;
	add(door, 1.6, 1.05, d / 2 - 0.01, false);
	add(new THREE.Mesh(keep(new THREE.SphereGeometry(0.035, 10, 8)), keep(new THREE.MeshStandardMaterial({ color: STONE.gold, metalness: 0.8, roughness: 0.3 }))), 1.22, 1.0, d / 2 - 0.05);
	const card = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.52, 0.35)), keep(new THREE.MeshStandardMaterial({ map: keep(postcard()), roughness: 0.6 })));
	card.rotation.y = Math.PI;
	// A few millimetres proud of its frame, so the two never fight over the same depth.
	add(card, 0.3, 1.55, d / 2 - 0.019, false);
	add(boxMesh(0.58, 0.41, 0.02, frameMat), 0.3, 1.55, d / 2 - 0.005, false);

	// Pendant bulb.
	const bulbLight = new THREE.PointLight(GETAWAY.lamp, 2.6, 7, 1.6);
	bulbLight.position.set(0, 2.3, 0.3);
	group.add(bulbLight);
	add(new THREE.Mesh(keep(new THREE.SphereGeometry(0.06, 12, 10)), keep(new THREE.MeshStandardMaterial({ color: GETAWAY.lamp, emissive: new THREE.Color(GETAWAY.lamp), emissiveIntensity: 3 }))), 0, 2.36, 0.3, false);
	add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 4)), ironMat), 0, 2.59, 0.3, false);

	const keepsakes = buildKeepsakes(castShadows);
	group.add(keepsakes.group);

	const colliders: Capsule[] = [
		...keepsakes.colliders,
		...boxWalls(0, 0, w, d).map((c) => ({ ...c, r: 0.12 })),
		...boxWalls(1.75, -1.15, 0.9, 1.3, Math.PI / 2 + 0.25),
		pillar(2.45, -1.95, 0.45),
		pillar(-2.05, 1.55, 0.55),
		pillar(-1.15, 2.0, 0.3),
		...boxWalls(w / 2 - 0.17, 1.25, 0.34, 1.32),
		pillar(w / 2 - 0.3, d / 2 - 0.25, 0.2)
	];
	const interactables: Interactable[] = [
		{ id: 'getaway:drawing-board', kind: 'drawing-board', x: 1.75, z: -1.15, radius: 2, y: 1.0 },
		{ id: 'getaway:cork-board', kind: 'cork-board', x: -w / 2, z: 0, radius: 2.6, y: CORK.y },
		{ id: 'getaway:exit', kind: 'exit-door', x: 1.6, z: d / 2, radius: 1.8, y: 1.1 },
		{ id: 'tidbit:postcard', kind: 'tidbit', x: 0.3, z: d / 2, radius: 1.5, y: 1.55 },
		...keepsakes.interactables
	];

	return {
		group,
		boards,
		colliders,
		interactables,
		lights: { stove: stoveLight, bulb: bulbLight },
		update(time) {
			pennantMat.uniforms.uTime.value = time;
			for (const p of particles) p.update(time);
			stoveLight.intensity = 3 + Math.sin(time * 6.1) * 0.35 + Math.sin(time * 14.3) * 0.25;
		},
		dispose() {
			for (const p of particles) p.dispose();
			boards.dispose();
			keepsakes.dispose();
			for (const x of disposables) x.dispose();
		}
	};
}
