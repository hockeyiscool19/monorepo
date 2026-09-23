// Eisenhold Square and its landmarks: flagstones and a curb, the central standing stone, the Word Wall that
// remembers every app's version, the travellers' campfire, a frozen pond and a signpost at the crossroads.

import * as THREE from 'three';
import { pillar, wall, type Capsule } from '../../domain/collide';
import type { RealmGate, RealmLayout } from '../../domain/realm';
import { inFrontOf } from '../../domain/realm';
import { rng } from '../noise';
import { FIRE, NIGHT, STONE, WOOD } from '../palette';
import { fire as fireParticles, smoke, type Particles } from '../particles';
import type { Interactable } from '../space';
import { softDot } from '../textures/common';
import { flagstones, runeRing, signBoard, stoneTexture, wordWall } from '../textures/realm';

export interface Hub {
	group: THREE.Group;
	colliders: Capsule[];
	interactables: Interactable[];
	fires: { x: number; z: number }[];
	update(t: number, near: { x: number; z: number }): void;
	dispose(): void;
}

export function buildHub(layout: RealmLayout, gates: RealmGate[], heightAt: (x: number, z: number) => number, pixelRatio: number): Hub {
	const group = new THREE.Group();
	group.name = 'hub';
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
	const colliders: Capsule[] = [];
	const interactables: Interactable[] = [];
	const particles: Particles[] = [];
	const hub = layout.hubRadius;

	// Flagstones and curb.
	const flagTex = keep(flagstones(21, 7));
	const square = new THREE.Mesh(keep(new THREE.CircleGeometry(hub, 64)), keep(new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.85 })));
	square.rotation.x = -Math.PI / 2;
	square.position.y = 0.03;
	square.receiveShadow = true;
	group.add(square);
	const stoneMat = keep(new THREE.MeshStandardMaterial({ map: keep(stoneTexture(8, [1, 1], 3)), roughness: 0.9, color: STONE.light }));
	const curbCount = 56;
	const curb = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1.2, 0.28, 0.5)), stoneMat, curbCount);
	const m = new THREE.Matrix4();
	for (let i = 0; i < curbCount; i++) {
		const a = (i / curbCount) * Math.PI * 2;
		m.makeRotationY(-a);
		m.setPosition(Math.cos(a) * (hub + 0.2), 0.1, Math.sin(a) * (hub + 0.2));
		curb.setMatrixAt(i, m);
	}
	curb.receiveShadow = true;
	group.add(curb);

	// The centre of the square: a low rune dais with a soul gem turning above it — low enough that every
	// gate stays in view from the road in.
	const dais = new THREE.Mesh(keep(new THREE.CylinderGeometry(2.3, 2.6, 0.42, 10)), stoneMat);
	dais.position.y = 0.21;
	dais.receiveShadow = true;
	dais.castShadow = true;
	group.add(dais);
	const ringTex = keep(runeRing(5150));
	const ringMat = keep(new THREE.MeshStandardMaterial({ color: STONE.dark, emissive: new THREE.Color(NIGHT.aurora[1]), emissiveMap: ringTex, emissiveIntensity: 1.3, roughness: 0.8 }));
	const ringTop = new THREE.Mesh(keep(new THREE.CircleGeometry(2.3, 40)), ringMat);
	ringTop.rotation.x = -Math.PI / 2;
	ringTop.position.y = 0.425;
	group.add(ringTop);
	const gemMat = keep(
		new THREE.MeshStandardMaterial({ color: NIGHT.aurora[2], emissive: new THREE.Color(NIGHT.aurora[2]), emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.3, flatShading: true, transparent: true, opacity: 0.92 })
	);
	const gem = new THREE.Mesh(keep(new THREE.OctahedronGeometry(0.42, 0)), gemMat);
	gem.scale.set(1, 1.7, 1);
	gem.position.y = 1.9;
	gem.castShadow = true;
	group.add(gem);
	const gemLight = new THREE.PointLight(NIGHT.aurora[2], 6, 9, 1.8);
	gemLight.position.y = 1.9;
	group.add(gemLight);
	colliders.push(pillar(0, 0, 2.5));

	// The Word Wall: a curved wall of carved stone. Its words are the apps and the versions that run.
	const words = gates.filter((g) => g.status !== 'planned').map((g) => ({ name: g.name, version: g.version ?? '' }));
	const ww = wordWall(words);
	// Seen from inside the curve, the cylinder's outward faces are back faces: mirror U so the words read.
	for (const tex of [ww.map, ww.glow]) {
		tex.wrapS = THREE.RepeatWrapping;
		tex.repeat.x = -1;
		keep(tex);
	}
	const wallMat = keep(
		new THREE.MeshStandardMaterial({ map: ww.map, emissiveMap: ww.glow, emissive: new THREE.Color(NIGHT.aurora[1]), emissiveIntensity: 0.25, roughness: 0.9, side: THREE.DoubleSide })
	);
	const arc = Math.PI * 0.55;
	const wallGeo = keep(new THREE.CylinderGeometry(6, 6, 4.6, 32, 1, true, Math.PI - arc / 2, arc));
	const wordWallMesh = new THREE.Mesh(wallGeo, wallMat);
	const ws = layout.wordWall;
	// The cylinder's axis stands on the square's side, so the curve wraps around whoever reads it.
	const center = inFrontOf(ws, 6);
	wordWallMesh.position.set(center.x, heightAt(ws.x, ws.z) + 2.3, center.z);
	wordWallMesh.rotation.y = ws.yaw + Math.PI;
	wordWallMesh.castShadow = true;
	group.add(wordWallMesh);
	for (let i = 0; i <= 6; i++) {
		const a = ws.yaw + Math.PI - arc / 2 + (arc * i) / 6;
		colliders.push(pillar(center.x - Math.sin(a) * 6, center.z - Math.cos(a) * 6, 0.6));
	}
	const readSpot = inFrontOf(ws, 2.2);
	interactables.push({ id: 'word-wall', kind: 'word-wall', x: ws.x, z: ws.z, radius: 5, y: 2.2 });

	// Campfire with two log benches.
	const cf = layout.campfire;
	const cfy = heightAt(cf.x, cf.z);
	const ring = new THREE.InstancedMesh(keep(new THREE.DodecahedronGeometry(0.28, 0)), stoneMat, 10);
	for (let i = 0; i < 10; i++) {
		const a = (i / 10) * Math.PI * 2;
		m.makeRotationY(a * 3);
		m.setPosition(cf.x + Math.cos(a) * 0.95, cfy + 0.12, cf.z + Math.sin(a) * 0.95);
		ring.setMatrixAt(i, m);
	}
	group.add(ring);
	const logMat = keep(new THREE.MeshStandardMaterial({ color: WOOD.log, roughness: 0.9 }));
	const logGeo = keep(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 6));
	for (let i = 0; i < 3; i++) {
		const log = new THREE.Mesh(logGeo, logMat);
		log.position.set(cf.x, cfy + 0.14, cf.z);
		log.rotation.set(Math.PI / 2, 0, (i / 3) * Math.PI);
		group.add(log);
	}
	const benchGeo = keep(new THREE.CylinderGeometry(0.26, 0.26, 2.2, 8));
	for (const side of [-1, 1]) {
		const bench = new THREE.Mesh(benchGeo, logMat);
		const bx = cf.x + Math.cos(cf.yaw) * 2.3 * side;
		const bz = cf.z - Math.sin(cf.yaw) * 2.3 * side;
		bench.position.set(bx, heightAt(bx, bz) + 0.26, bz);
		bench.rotation.set(0, cf.yaw + Math.PI / 2, Math.PI / 2);
		bench.castShadow = true;
		group.add(bench);
		const ex = Math.sin(cf.yaw) * 1.1;
		const ez = Math.cos(cf.yaw) * 1.1;
		colliders.push(wall(bx - ex, bz - ez, bx + ex, bz + ez, 0.35));
	}
	const campfire = fireParticles({ count: 70, seed: 42, radius: 0.45, height: 1.5, size: 110, core: new THREE.Color(FIRE.core), flame: new THREE.Color(FIRE.flame), ember: new THREE.Color(FIRE.ember), pixelRatio });
	campfire.points.position.set(cf.x, cfy + 0.15, cf.z);
	group.add(campfire.points);
	particles.push(campfire);
	const puff = keep(softDot(64, 0.1));
	const cfSmoke = smoke({ count: 16, height: 9, color: new THREE.Color(FIRE.smoke), pixelRatio, map: puff });
	cfSmoke.points.position.set(cf.x, cfy + 1.4, cf.z);
	group.add(cfSmoke.points);
	particles.push(cfSmoke);
	const cfLight = new THREE.PointLight(FIRE.light, 22, 18, 1.8);
	cfLight.position.set(cf.x, cfy + 1.2, cf.z);
	group.add(cfLight);
	colliders.push(pillar(cf.x, cf.z, 1.1));
	interactables.push({ id: 'campfire', kind: 'campfire', x: cf.x, z: cf.z, radius: 3.2, y: 0.6 });

	// Stillwater Pond: ice that catches the firelight.
	const pd = layout.pond;
	const ice = new THREE.Mesh(
		keep(new THREE.CircleGeometry(7.2, 48)),
		keep(new THREE.MeshStandardMaterial({ color: NIGHT.aurora[1], roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.85 }))
	);
	ice.rotation.x = -Math.PI / 2;
	ice.position.set(pd.x, -0.3, pd.z);
	ice.receiveShadow = true;
	group.add(ice);

	// Signpost at the southern edge of the square, pointing at each gate.
	const sp = { x: -2.6, z: hub + 1.6 };
	const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.09, 0.11, 3.2, 6)), logMat);
	post.position.set(sp.x, 1.6, sp.z);
	group.add(post);
	const signs = [...gates.filter((g) => g.status !== 'planned').map((g) => g.name), 'My Get-a-way'].slice(0, 5);
	const rand = rng(3);
	signs.forEach((name, i) => {
		const target = name === 'My Get-a-way' ? layout.cabin : layout.gates.find((g) => g.gate.name === name)?.spot;
		if (!target) return;
		const tex = keep(signBoard(name));
		const board = new THREE.Mesh(keep(new THREE.BoxGeometry(1.5, 0.34, 0.05)), [
			logMat,
			logMat,
			logMat,
			logMat,
			keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })),
			keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }))
		]);
		const angle = Math.atan2(target.x - sp.x, target.z - sp.z);
		board.position.set(sp.x + Math.sin(angle) * 0.7, 2.75 - i * 0.42, sp.z + Math.cos(angle) * 0.7);
		board.rotation.y = angle - Math.PI / 2 + (rand() - 0.5) * 0.05;
		board.castShadow = true;
		group.add(board);
	});
	colliders.push(pillar(sp.x, sp.z, 0.3));
	interactables.push({ id: 'signpost', kind: 'signpost', x: sp.x, z: sp.z, radius: 2.6, y: 2.3 });

	return {
		group,
		colliders,
		interactables,
		fires: [{ x: cf.x, z: cf.z }],
		update(t, near) {
			for (const p of particles) p.update(t);
			gem.rotation.y = t * 0.6;
			gem.position.y = 1.9 + Math.sin(t * 1.3) * 0.12;
			gemLight.intensity = 5.5 + Math.sin(t * 2.1) * 0.8;
			cfLight.intensity = 20 + Math.sin(t * 7.3) * 2.5 + Math.sin(t * 17.1) * 1.5;
			const d = Math.hypot(near.x - readSpot.x, near.z - readSpot.z);
			wallMat.emissiveIntensity = 0.25 + Math.max(0, 1 - d / 9) * 1.4 * (0.8 + 0.2 * Math.sin(t * 2));
		},
		dispose() {
			for (const p of particles) p.dispose();
			for (const d of disposables) d.dispose();
		}
	};
}
