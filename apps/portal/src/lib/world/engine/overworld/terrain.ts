// The valley of Eisenhold: a flat square, gentle snowfields, and a ring of ridged mountains, with trodden
// paths from the square to every gate and landmark, and a frozen brook carved under the Vermont bridge.
// The mesh is built from ground(); heightAt() is ground() plus the decks you can walk on (the bridge), so the
// player's feet and what they stand on always agree.

import * as THREE from 'three';
import type { RealmLayout } from '../../domain/realm';
import { inFrontOf } from '../../domain/realm';
import { lerp, noise2, seedFrom, smoothstep } from '../noise';
import { NIGHT } from '../palette';
import type { Quality } from '../space';
import { groundDetail } from '../textures/realm';

export interface Terrain {
	mesh: THREE.Mesh;
	/** Where feet land: the ground, or a deck above it. */
	heightAt(x: number, z: number): number;
	/** Path and brook centre-lines, for keeping trees off the roads and out of the brook. */
	paths: [number, number, number, number][];
	dispose(): void;
}

interface Pad {
	x: number;
	z: number;
	r: number;
	h: number;
}

const SIZE = 620;
const SEGMENTS: Record<Quality, number> = { low: 110, medium: 170, high: 230 };

/** How far the banks of a brook reach beyond its bed. */
const BANK = 2.2;

/** The point on the segment a→b nearest to (px, pz). */
function nearestOn([ax, az, bx, bz]: [number, number, number, number], px: number, pz: number): [number, number] {
	const dx = bx - ax;
	const dz = bz - az;
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
	return [ax + t * dx, az + t * dz];
}

function segDistance(px: number, pz: number, [ax, az, bx, bz]: [number, number, number, number]): number {
	const dx = bx - ax;
	const dz = bz - az;
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
	return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export function buildTerrain(layout: RealmLayout, quality: Quality): Terrain {
	const n = noise2(seedFrom('eisenhold'));
	const hub = layout.hubRadius;

	const pads: Pad[] = [
		...layout.gates.map((g) => ({ x: g.spot.x, z: g.spot.z, r: 6.5, h: 0 })),
		{ x: layout.cabin.x, z: layout.cabin.z, r: 8.5, h: 0 },
		{ x: layout.wordWall.x, z: layout.wordWall.z, r: 6, h: 0 },
		{ x: layout.campfire.x, z: layout.campfire.z, r: 4.5, h: 0 },
		{ x: layout.guard.x, z: layout.guard.z, r: 2.5, h: 0 },
		// Stillwater Pond (the rink) already lies flat in its hollow.
		...layout.landmarks.filter((l) => l.id !== 'rink').map((l) => ({ x: l.spot.x, z: l.spot.z, r: l.clear, h: 0 }))
	];

	// Paths from the edge of the square to what matters, plus the road south to the spawn point.
	const edge = (x: number, z: number): [number, number] => {
		const d = Math.hypot(x, z) || 1;
		return [(x / d) * (hub - 0.5), (z / d) * (hub - 0.5)];
	};
	const targets = [
		...layout.gates.map((g) => inFrontOf(g.spot, 2.2)),
		inFrontOf(layout.cabin, 4.4),
		inFrontOf(layout.wordWall, 2.5),
		layout.campfire
	];
	const paths: [number, number, number, number][] = targets.map((t) => {
		const [ax, az] = edge(t.x, t.z);
		return [ax, az, t.x, t.z];
	});
	const road: [number, number, number, number] = [0, hub - 0.5, layout.spawn.x, layout.spawn.z + 30];
	paths.push(road);
	for (const l of layout.landmarks) {
		const t = inFrontOf(l.spot, l.approach);
		const [ax, az] = l.via === 'road' ? nearestOn(road, t.x, t.z) : edge(t.x, t.z);
		paths.push([ax, az, t.x, t.z]);
	}
	const brooks = layout.brooks.map((b) => ({ ...b, seg: [b.ax, b.az, b.bx, b.bz] as [number, number, number, number] }));

	function ground(x: number, z: number): number {
		const r = Math.hypot(x, z);
		let h = n.fbm(x * 0.025, z * 0.025, 3) * 1.6 * smoothstep(hub + 1, hub + 16, r);
		h += smoothstep(56, 118, r) * (12 + 50 * n.ridged(x * 0.011, z * 0.011, 5));
		h += smoothstep(118, 280, r) * 80;
		for (const pad of pads) {
			const d = Math.hypot(x - pad.x, z - pad.z);
			if (d < pad.r + 5) h = lerp(h, pad.h, 1 - smoothstep(pad.r, pad.r + 5, d));
		}
		const pd = Math.hypot(x - layout.pond.x, z - layout.pond.z);
		if (pd < 11) h = lerp(h, -0.45, 1 - smoothstep(6.5, 11, pd));
		for (const b of brooks) {
			const d = segDistance(x, z, b.seg);
			if (d < b.width / 2 + BANK) h = lerp(h, -b.depth, 1 - smoothstep(b.width / 2, b.width / 2 + BANK, d));
		}
		if (r < hub + 1) h = lerp(0, h, smoothstep(hub - 1, hub + 1, r));
		return h;
	}

	function heightAt(x: number, z: number): number {
		const h = ground(x, z);
		for (const d of layout.decks) {
			const dx = x - d.x;
			const dz = z - d.z;
			const c = Math.cos(d.yaw);
			const s = Math.sin(d.yaw);
			// Into the deck's frame: across it (u) and along it (v).
			const u = dx * c - dz * s;
			const v = dx * s + dz * c;
			if (Math.abs(u) <= d.width / 2 && Math.abs(v) <= d.length / 2) return Math.max(h, d.height);
		}
		return h;
	}

	const seg = SEGMENTS[quality];
	const geometry = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
	geometry.rotateX(-Math.PI / 2);
	const pos = geometry.attributes.position as THREE.BufferAttribute;
	for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i), pos.getZ(i)));
	geometry.computeVertexNormals();

	const normals = geometry.attributes.normal as THREE.BufferAttribute;
	const colors = new Float32Array(pos.count * 3);
	const snow = new THREE.Color(NIGHT.snow);
	const shadow = new THREE.Color(NIGHT.snowShadow);
	const rock = new THREE.Color(NIGHT.rock);
	const rockDark = new THREE.Color(NIGHT.rockDark);
	const trodden = new THREE.Color(NIGHT.trodden);
	const c = new THREE.Color();
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const z = pos.getZ(i);
		const y = pos.getY(i);
		const slope = 1 - normals.getY(i);
		c.copy(snow).lerp(shadow, 0.5 + 0.5 * n.at(x * 0.05, z * 0.05));
		const rocky = smoothstep(0.18, 0.42, slope) * (1 - smoothstep(70, 95, y) * 0.6);
		c.lerp(c.clone().copy(rock).lerp(rockDark, 0.5 + 0.5 * n.at(x * 0.2, z * 0.2)), rocky);
		let path = 0;
		for (const p of paths) path = Math.max(path, 1 - smoothstep(1.1, 2.3, segDistance(x, z, p)));
		c.lerp(trodden, path * 0.75 * (0.8 + 0.2 * n.at(x * 0.7, z * 0.7)));
		colors.set([c.r, c.g, c.b], i * 3);
	}
	geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

	const detail = groundDetail(3, 120);
	const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, map: detail });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.receiveShadow = true;
	mesh.name = 'terrain';

	return {
		mesh,
		heightAt,
		paths: [...paths, ...brooks.map((b) => b.seg)],
		dispose() {
			geometry.dispose();
			material.dispose();
			detail.dispose();
		}
	};
}
