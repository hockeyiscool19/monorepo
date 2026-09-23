// My Get-a-way from outside: a small log cabin under snow, warm light in the windows, smoke from the
// chimney, a lantern by the door and a carved sign. Its door leads to the room with Colorado inside.

import * as THREE from 'three';
import { box as boxWalls, pillar, type Capsule } from '../../domain/collide';
import type { Spot } from '../../domain/realm';
import { FIRE, GETAWAY, NIGHT, STONE, WOOD } from '../palette';
import { fire as fireParticles, smoke, type Particles } from '../particles';
import type { Interactable } from '../space';
import { softDot } from '../textures/common';
import { signBoard, stoneTexture } from '../textures/realm';
import { wood } from '../textures/room';

export interface Cabin {
	group: THREE.Group;
	colliders: Capsule[];
	interactable: Interactable;
	/** Where the player appears when leaving the Get-a-way. */
	doorstep: Spot;
	update(t: number): void;
	dispose(): void;
}

const W = 7.4;
const D = 6.2;
const H = 3.1;

export function buildCabin(spot: Spot, groundY: number, pixelRatio: number): Cabin {
	const group = new THREE.Group();
	group.name = 'cabin';
	group.position.set(spot.x, groundY, spot.z);
	group.rotation.y = spot.yaw;
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
	const particles: Particles[] = [];

	const logs = keep(wood(31, 'logs', WOOD.log, WOOD.logDark, [2, 1]));
	const logMat = keep(new THREE.MeshStandardMaterial({ map: logs, roughness: 0.9 }));
	const body = new THREE.Mesh(keep(new THREE.BoxGeometry(W, H, D)), logMat);
	body.position.y = H / 2;
	body.castShadow = true;
	body.receiveShadow = true;
	group.add(body);

	// Gabled roof: two slabs meeting at the ridge, a snow layer on each, gable triangles in logs.
	const pitch = 0.62;
	const slope = (D / 2 + 0.6) / Math.cos(pitch);
	const roofMat = keep(new THREE.MeshStandardMaterial({ color: WOOD.logDark, roughness: 0.95 }));
	const snowMat = keep(new THREE.MeshStandardMaterial({ color: NIGHT.snow, roughness: 0.85 }));
	const ridgeY = H + Math.tan(pitch) * (D / 2) + 0.1;
	for (const side of [-1, 1]) {
		const slab = new THREE.Mesh(keep(new THREE.BoxGeometry(W + 1.0, 0.22, slope)), roofMat);
		slab.position.set(0, ridgeY - (Math.sin(pitch) * slope) / 2, (side * Math.cos(pitch) * slope) / 2);
		slab.rotation.x = side * pitch;
		slab.castShadow = true;
		group.add(slab);
		const snow = new THREE.Mesh(keep(new THREE.BoxGeometry(W + 1.05, 0.16, slope * 0.98)), snowMat);
		snow.position.copy(slab.position).add(new THREE.Vector3(0, 0.17 * Math.cos(pitch), 0.17 * Math.sin(pitch) * side));
		snow.rotation.x = side * pitch;
		snow.receiveShadow = true;
		group.add(snow);
	}
	const gableShape = new THREE.Shape();
	gableShape.moveTo(-D / 2, 0);
	gableShape.lineTo(D / 2, 0);
	gableShape.lineTo(0, ridgeY - H);
	gableShape.closePath();
	const gableGeo = keep(new THREE.ShapeGeometry(gableShape));
	for (const side of [-1, 1]) {
		const gable = new THREE.Mesh(gableGeo, logMat);
		gable.position.set((side * W) / 2, H, 0);
		gable.rotation.y = (side * Math.PI) / 2;
		group.add(gable);
	}

	// Stone chimney on the right, smoking.
	const chimney = new THREE.Mesh(keep(new THREE.BoxGeometry(1.0, 5.6, 1.0)), keep(new THREE.MeshStandardMaterial({ map: keep(stoneTexture(12, [1, 3], 4)), roughness: 0.9 })));
	chimney.position.set(W / 2 - 0.9, 2.8, 1.2);
	chimney.castShadow = true;
	group.add(chimney);
	const puff = keep(softDot(64, 0.1));
	const chimneySmoke = smoke({ count: 22, height: 12, color: new THREE.Color(FIRE.smoke), pixelRatio, map: puff });
	chimneySmoke.points.position.set(W / 2 - 0.9, 5.7, 1.2);
	group.add(chimneySmoke.points);
	particles.push(chimneySmoke);

	// Front (local −z): door, windows, lantern, sign, porch.
	const front = -D / 2 - 0.01;
	const doorTex = keep(wood(9, 'boards', WOOD.plank, WOOD.plankDark, [1, 1]));
	doorTex.rotation = Math.PI / 2;
	const door = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.2, 2.2)), keep(new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.8 })));
	door.position.set(-0.6, 1.1, front);
	door.rotation.y = Math.PI;
	group.add(door);
	const glowMat = keep(new THREE.MeshStandardMaterial({ color: WOOD.windowGlow, emissive: new THREE.Color(WOOD.windowGlow), emissiveIntensity: 1.6 }));
	const frameMat = keep(new THREE.MeshStandardMaterial({ color: GETAWAY.frame, roughness: 0.8 }));
	for (const x of [-2.6, 1.6]) {
		const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.3, 1.0)), glowMat);
		pane.position.set(x, 1.7, front - 0.01);
		pane.rotation.y = Math.PI;
		group.add(pane);
		const mullionV = new THREE.Mesh(keep(new THREE.BoxGeometry(0.08, 1.1, 0.06)), frameMat);
		mullionV.position.set(x, 1.7, front - 0.04);
		group.add(mullionV);
		const mullionH = new THREE.Mesh(keep(new THREE.BoxGeometry(1.4, 0.08, 0.06)), frameMat);
		mullionH.position.set(x, 1.7, front - 0.04);
		group.add(mullionH);
		const sill = new THREE.Mesh(keep(new THREE.BoxGeometry(1.5, 0.1, 0.25)), snowMat);
		sill.position.set(x, 1.15, front - 0.12);
		group.add(sill);
	}
	const lantern = fireParticles({ count: 14, seed: 3, radius: 0.05, height: 0.18, size: 40, core: new THREE.Color(FIRE.core), flame: new THREE.Color(FIRE.flame), ember: new THREE.Color(FIRE.ember), pixelRatio });
	lantern.points.position.set(0.35, 2.35, front - 0.3);
	group.add(lantern.points);
	particles.push(lantern);
	const cage = new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 0.34, 0.22)), keep(new THREE.MeshStandardMaterial({ color: STONE.iron, metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.55 })));
	cage.position.set(0.35, 2.42, front - 0.3);
	group.add(cage);
	const lanternLight = new THREE.PointLight(FIRE.light, 10, 11, 1.8);
	lanternLight.position.set(0.35, 2.4, front - 0.6);
	group.add(lanternLight);
	const windowLight = new THREE.PointLight(WOOD.windowGlow, 6, 9, 2);
	windowLight.position.set(0, 1.6, front - 1.2);
	group.add(windowLight);

	const signTex = keep(signBoard('My Get-a-way', true));
	const sign = new THREE.Mesh(keep(new THREE.BoxGeometry(2.4, 0.6, 0.06)), [
		roofMat,
		roofMat,
		roofMat,
		roofMat,
		keep(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.9 })),
		keep(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.9 }))
	]);
	sign.position.set(-0.6, 2.75, front - 0.05);
	sign.rotation.y = Math.PI;
	group.add(sign);

	const porch = new THREE.Mesh(keep(new THREE.BoxGeometry(3.4, 0.16, 1.6)), keep(new THREE.MeshStandardMaterial({ map: keep(wood(4, 'boards', WOOD.plank, WOOD.plankDark, [2, 1])), roughness: 0.85 })));
	porch.position.set(-0.6, 0.08, front - 0.8);
	porch.receiveShadow = true;
	group.add(porch);

	// Firewood stacked under the left window.
	const logGeo = keep(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 7));
	const firewoodMat = keep(new THREE.MeshStandardMaterial({ color: WOOD.log, roughness: 0.9 }));
	for (let row = 0; row < 3; row++) {
		for (let i = 0; i < 5 - row; i++) {
			const log = new THREE.Mesh(logGeo, firewoodMat);
			log.rotation.x = Math.PI / 2;
			log.position.set(-3.2 + i * 0.25 + row * 0.12, 0.13 + row * 0.22, front - 0.5);
			group.add(log);
		}
	}

	const toWorld = (lx: number, lz: number) => {
		const c = Math.cos(spot.yaw);
		const s = Math.sin(spot.yaw);
		return { x: spot.x + lx * c + lz * s, z: spot.z - lx * s + lz * c };
	};
	const doorWorld = toWorld(-0.6, front);
	const step = toWorld(-0.6, front - 2.6);
	const chimneyWorld = toWorld(W / 2 - 0.9, 1.2);

	return {
		group,
		colliders: [...boxWalls(spot.x, spot.z, W, D, spot.yaw), pillar(chimneyWorld.x, chimneyWorld.z, 0.7)],
		interactable: { id: 'cabin-door', kind: 'cabin-door', x: doorWorld.x, z: doorWorld.z, radius: 3, y: 1.2 },
		doorstep: { x: step.x, z: step.z, yaw: spot.yaw },
		update(t) {
			for (const p of particles) p.update(t);
			lanternLight.intensity = 9 + Math.sin(t * 8.3) * 0.9 + Math.sin(t * 19.7) * 0.6;
		},
		dispose() {
			for (const p of particles) p.dispose();
			for (const d of disposables) d.dispose();
		}
	};
}
