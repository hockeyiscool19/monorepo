// Life in Eisenhold: a hold guard who turns to watch you and has opinions about Friday deploys, and a
// dragon that circles the peaks now and then. Both are built from primitives and animated by hand.

import * as THREE from 'three';
import { pillar, type Capsule } from '../../domain/collide';
import type { Spot } from '../../domain/realm';
import { CLOTH, STONE, WOOD } from '../palette';
import type { Interactable } from '../space';
import { tabard } from '../textures/realm';

export interface Guard {
	group: THREE.Group;
	collider: Capsule;
	interactable: Interactable;
	update(t: number, player: { x: number; z: number }): void;
	dispose(): void;
}

export function buildGuard(spot: Spot, groundY: number): Guard {
	const group = new THREE.Group();
	group.name = 'guard';
	group.position.set(spot.x, groundY, spot.z);
	group.rotation.y = spot.yaw;
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
	const mail = keep(new THREE.MeshStandardMaterial({ color: CLOTH.guardMail, metalness: 0.55, roughness: 0.5 }));
	const leather = keep(new THREE.MeshStandardMaterial({ color: CLOTH.leather, roughness: 0.85 }));
	const skin = keep(new THREE.MeshStandardMaterial({ color: CLOTH.skin, roughness: 0.7 }));
	const iron = keep(new THREE.MeshStandardMaterial({ color: STONE.iron, metalness: 0.7, roughness: 0.4 }));
	const cloth = keep(new THREE.MeshStandardMaterial({ map: keep(tabard()), roughness: 0.9 }));
	const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
		const mesh = new THREE.Mesh(keep(geo), mat);
		mesh.position.set(x, y, z);
		mesh.castShadow = true;
		parent.add(mesh);
		return mesh;
	};
	for (const side of [-1, 1]) {
		part(new THREE.BoxGeometry(0.24, 0.9, 0.26), leather, side * 0.15, 0.45, 0);
		part(new THREE.BoxGeometry(0.26, 0.14, 0.36), leather, side * 0.15, 0.07, -0.04);
	}
	const torso = new THREE.Group();
	torso.position.y = 0.9;
	group.add(torso);
	part(new THREE.BoxGeometry(0.62, 0.72, 0.34), mail, 0, 0.36, 0, torso);
	const front = part(new THREE.PlaneGeometry(0.46, 0.9), cloth, 0, 0.28, -0.18, torso);
	front.rotation.y = Math.PI;
	part(new THREE.BoxGeometry(0.66, 0.1, 0.38), leather, 0, 0.02, 0, torso);
	for (const side of [-1, 1]) {
		part(new THREE.SphereGeometry(0.15, 10, 8), iron, side * 0.38, 0.66, 0, torso);
		part(new THREE.BoxGeometry(0.16, 0.66, 0.18), mail, side * 0.4, 0.3, 0, torso);
	}
	// The spear, planted, held in the right hand.
	part(new THREE.CylinderGeometry(0.025, 0.03, 2.5, 6), keep(new THREE.MeshStandardMaterial({ color: WOOD.bark })), 0.55, 1.2, -0.08);
	part(new THREE.ConeGeometry(0.06, 0.28, 4), iron, 0.55, 2.55, -0.08);
	// A round shield on the back.
	const shield = part(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 16), keep(new THREE.MeshStandardMaterial({ color: WOOD.plank, roughness: 0.8 })), 0, 0.4, 0.22, torso);
	shield.rotation.x = Math.PI / 2;
	const head = new THREE.Group();
	head.position.y = 1.74;
	group.add(head);
	part(new THREE.SphereGeometry(0.15, 12, 10), skin, 0, 0, 0, head);
	part(new THREE.CylinderGeometry(0.17, 0.18, 0.16, 12), iron, 0, 0.07, 0, head);
	part(new THREE.ConeGeometry(0.17, 0.22, 12), iron, 0, 0.25, 0, head);
	part(new THREE.BoxGeometry(0.03, 0.16, 0.05), iron, 0, -0.02, -0.16, head);

	return {
		group,
		collider: pillar(spot.x, spot.z, 0.5),
		interactable: { id: 'guard', kind: 'guard', x: spot.x, z: spot.z, radius: 3, y: 1.6 },
		update(t, player) {
			torso.scale.y = 1 + Math.sin(t * 1.6) * 0.012;
			const dx = player.x - spot.x;
			const dz = player.z - spot.z;
			const near = Math.hypot(dx, dz) < 9;
			const look = Math.atan2(-dx, -dz) - spot.yaw;
			const wrapped = Math.atan2(Math.sin(look), Math.cos(look));
			const target = near ? Math.max(-1.1, Math.min(1.1, wrapped)) : Math.sin(t * 0.3) * 0.4;
			head.rotation.y += (target - head.rotation.y) * 0.06;
		},
		dispose() {
			for (const d of disposables) d.dispose();
		}
	};
}

export interface Dragon {
	group: THREE.Group;
	update(t: number): void;
	dispose(): void;
}

/** A dark dragon on a wide loop around the valley, wings beating, well above the peaks. */
export function buildDragon(): Dragon {
	const group = new THREE.Group();
	group.name = 'dragon';
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
	const hide = keep(new THREE.MeshStandardMaterial({ color: CLOTH.dragon, roughness: 0.7 }));
	const membrane = keep(new THREE.MeshStandardMaterial({ color: CLOTH.dragonWing, roughness: 0.8, side: THREE.DoubleSide }));
	const body = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.9, 5, 4, 8)), hide);
	body.rotation.x = Math.PI / 2;
	group.add(body);
	const neck = new THREE.Mesh(keep(new THREE.ConeGeometry(0.55, 3.2, 8)), hide);
	neck.rotation.x = -Math.PI / 2 - 0.25;
	neck.position.set(0, 0.5, -4);
	group.add(neck);
	const headMesh = new THREE.Mesh(keep(new THREE.ConeGeometry(0.45, 1.6, 6)), hide);
	headMesh.rotation.x = -Math.PI / 2;
	headMesh.position.set(0, 0.95, -5.9);
	group.add(headMesh);
	const tail = new THREE.Mesh(keep(new THREE.ConeGeometry(0.6, 7, 8)), hide);
	tail.rotation.x = Math.PI / 2;
	tail.position.set(0, 0, 6.3);
	group.add(tail);
	const wingShape = new THREE.Shape();
	wingShape.moveTo(0, 0);
	wingShape.lineTo(3.5, 1.2);
	wingShape.lineTo(8.5, 0.4);
	wingShape.lineTo(6.2, -1.2);
	wingShape.lineTo(4.4, -0.6);
	wingShape.lineTo(3.2, -2.2);
	wingShape.lineTo(1.6, -1.2);
	wingShape.lineTo(0, -2.4);
	wingShape.closePath();
	const wingGeo = keep(new THREE.ShapeGeometry(wingShape));
	const wings: THREE.Group[] = [];
	for (const side of [-1, 1]) {
		const pivot = new THREE.Group();
		pivot.position.set(side * 0.7, 0.4, -1);
		const wing = new THREE.Mesh(wingGeo, membrane);
		wing.rotation.x = -Math.PI / 2;
		wing.scale.x = side;
		pivot.add(wing);
		group.add(pivot);
		wings.push(pivot);
	}
	group.scale.setScalar(1.6);
	return {
		group,
		update(t) {
			const period = 70;
			const a = (t / period) * Math.PI * 2;
			const r = 150;
			group.position.set(Math.cos(a) * r, 95 + Math.sin(a * 2) * 12, Math.sin(a) * r - 40);
			// Face along the direction of travel (the derivative of the circle), banking into the turn.
			group.rotation.set(0, Math.atan2(Math.sin(a), -Math.cos(a)), 0.35);
			const flap = Math.sin(t * 3.2) * 0.55;
			wings[0].rotation.z = flap;
			wings[1].rotation.z = -flap;
		},
		dispose() {
			for (const d of disposables) d.dispose();
		}
	};
}
