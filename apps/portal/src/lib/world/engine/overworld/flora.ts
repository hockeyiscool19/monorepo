// Snow-laden pines and frost-cracked boulders, instanced: one draw call per kind however many there are.
// Placement is seeded and keeps clear of roads, gates, the cabin and the pond. Trees inside the walkable
// ring become colliders.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pillar, type Capsule } from '../../domain/collide';
import type { RealmLayout } from '../../domain/realm';
import { noise2, rng } from '../noise';
import { NIGHT, WOOD } from '../palette';
import type { Quality } from '../space';

const COUNTS: Record<Quality, { pines: number; rocks: number }> = {
	low: { pines: 170, rocks: 50 },
	medium: { pines: 380, rocks: 90 },
	high: { pines: 560, rocks: 130 }
};

function colour(geometry: THREE.BufferGeometry, fn: (y: number, ny: number, i: number) => THREE.Color): THREE.BufferGeometry {
	const pos = geometry.attributes.position;
	geometry.computeVertexNormals();
	const nrm = geometry.attributes.normal;
	const out = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i++) {
		const c = fn(pos.getY(i), nrm.getY(i), i);
		out.set([c.r, c.g, c.b], i * 3);
	}
	geometry.setAttribute('color', new THREE.BufferAttribute(out, 3));
	return geometry;
}

/** A pine: trunk plus three cone tiers, snow on the upward faces of each tier. */
function pineGeometry(): THREE.BufferGeometry {
	const snow = new THREE.Color(NIGHT.snow);
	const needles = new THREE.Color(WOOD.pine);
	const deep = new THREE.Color(WOOD.pineDark);
	const bark = new THREE.Color(WOOD.bark);
	const trunk = colour(new THREE.CylinderGeometry(0.16, 0.24, 2.2, 6).translate(0, 1.1, 0), () => bark);
	const tiers = [
		[2.1, 3.0, 1.9],
		[1.6, 2.6, 3.4],
		[1.05, 2.2, 4.8]
	].map(([radius, height, y]) =>
		colour(new THREE.ConeGeometry(radius, height, 8, 1).translate(0, y, 0), (_y, ny) => {
			if (ny > 0.55) return snow;
			return ny > 0.35 ? needles.clone().lerp(snow, 0.35) : ny < 0 ? deep : needles;
		})
	);
	const merged = mergeGeometries([trunk, ...tiers].map((g) => g.toNonIndexed()));
	return merged ?? trunk;
}

function rockGeometry(seed: number): THREE.BufferGeometry {
	const g = new THREE.IcosahedronGeometry(1, 1);
	const n = noise2(seed);
	const pos = g.attributes.position;
	for (let i = 0; i < pos.count; i++) {
		const v = new THREE.Vector3().fromBufferAttribute(pos, i);
		v.multiplyScalar(0.75 + 0.35 * n.at(v.x * 1.7, v.z * 1.7 + v.y));
		v.y *= 0.62;
		pos.setXYZ(i, v.x, v.y, v.z);
	}
	const snow = new THREE.Color(NIGHT.snow);
	const rock = new THREE.Color(NIGHT.rock);
	const dark = new THREE.Color(NIGHT.rockDark);
	// IcosahedronGeometry is already non-indexed: one normal per face gives the faceted, frost-cracked look.
	return colour(g, (_y, ny) => (ny > 0.6 ? snow : ny > 0.1 ? rock : dark));
}

export interface Flora {
	group: THREE.Group;
	colliders: Capsule[];
	dispose(): void;
}

interface Keepout {
	x: number;
	z: number;
	r: number;
}

export function buildFlora(
	layout: RealmLayout,
	heightAt: (x: number, z: number) => number,
	paths: [number, number, number, number][],
	quality: Quality
): Flora {
	const rand = rng(1234);
	const n = noise2(88);
	const group = new THREE.Group();
	group.name = 'flora';
	const colliders: Capsule[] = [];
	const keep: Keepout[] = [
		...layout.gates.map((g) => ({ x: g.spot.x, z: g.spot.z, r: 8 })),
		{ x: layout.cabin.x, z: layout.cabin.z, r: 10 },
		{ x: layout.wordWall.x, z: layout.wordWall.z, r: 7 },
		{ x: layout.campfire.x, z: layout.campfire.z, r: 6 },
		{ x: layout.pond.x, z: layout.pond.z, r: 10 },
		{ x: layout.spawn.x, z: layout.spawn.z, r: 5 }
	];
	const nearPath = (x: number, z: number) =>
		paths.some(([ax, az, bx, bz]) => {
			const dx = bx - ax;
			const dz = bz - az;
			const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
			return Math.hypot(x - (ax + t * dx), z - (az + t * dz)) < 3.2;
		});
	const free = (x: number, z: number, minR: number) => {
		const r = Math.hypot(x, z);
		if (r < minR || nearPath(x, z)) return false;
		return keep.every((k) => Math.hypot(x - k.x, z - k.z) > k.r);
	};

	const { pines, rocks } = COUNTS[quality];
	const pineMesh = new THREE.InstancedMesh(pineGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), pines);
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const s = new THREE.Vector3();
	const p = new THREE.Vector3();
	let placed = 0;
	for (let tries = 0; placed < pines && tries < pines * 30; tries++) {
		const a = rand() * Math.PI * 2;
		const r = 17 + Math.pow(rand(), 0.8) * 115;
		const x = Math.sin(a) * r;
		const z = -Math.cos(a) * r;
		// Groves: noise thins the forest into clumps and clearings.
		if (n.fbm(x * 0.03, z * 0.03, 3) < -0.05 + (r < 40 ? 0.2 : 0)) continue;
		if (!free(x, z, layout.hubRadius + 5)) continue;
		const scale = 0.75 + rand() * 0.9;
		q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
		p.set(x, heightAt(x, z) - 0.15, z);
		s.set(scale, scale * (0.9 + rand() * 0.3), scale);
		pineMesh.setMatrixAt(placed++, m.compose(p, q, s));
		if (r < layout.boundary + 2) colliders.push(pillar(x, z, 0.32 * scale + 0.1));
	}
	pineMesh.count = placed;
	pineMesh.castShadow = true;
	pineMesh.receiveShadow = true;
	group.add(pineMesh);

	const rockMesh = new THREE.InstancedMesh(rockGeometry(7), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), rocks);
	let stones = 0;
	for (let tries = 0; stones < rocks && tries < rocks * 30; tries++) {
		const a = rand() * Math.PI * 2;
		const r = 14 + rand() * 105;
		const x = Math.sin(a) * r;
		const z = -Math.cos(a) * r;
		if (!free(x, z, layout.hubRadius + 3)) continue;
		const scale = 0.5 + Math.pow(rand(), 2) * 2.6;
		q.setFromEuler(new THREE.Euler(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4));
		p.set(x, heightAt(x, z) + scale * 0.15, z);
		s.set(scale * (0.8 + rand() * 0.6), scale, scale * (0.8 + rand() * 0.6));
		rockMesh.setMatrixAt(stones++, m.compose(p, q, s));
		if (r < layout.boundary + 2 && scale > 0.7) colliders.push(pillar(x, z, scale * 0.9));
	}
	rockMesh.count = stones;
	rockMesh.castShadow = quality !== 'low';
	rockMesh.receiveShadow = true;
	group.add(rockMesh);

	return {
		group,
		colliders,
		dispose() {
			for (const mesh of [pineMesh, rockMesh]) {
				mesh.geometry.dispose();
				(mesh.material as THREE.Material).dispose();
			}
		}
	};
}
