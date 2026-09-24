// A small workshop for the Jarl's landmarks. Pieces are placed in a landmark's own frame (it faces local −z, towards
// whoever walks up) and merged into one mesh per material, so a whole landmark costs a handful of draw calls.
// Colliders, tidbits and signs are placed in the same frame; moving parts are added as they are and animated.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box as boxWalls, pillar, wall, type Capsule } from '../../../domain/collide';
import { fromSpot, type Spot } from '../../../domain/realm';
import { WOOD } from '../../palette';
import { clothFragment, clothVertex } from '../../shaders';
import type { Interactable } from '../../space';

/** What a landmark hands to the overworld. */
export interface Site {
	group: THREE.Group;
	colliders: Capsule[];
	interactables: Interactable[];
	update(t: number): void;
	dispose(): void;
}

export interface KitContext {
	heightAt(x: number, z: number): number;
	pixelRatio: number;
	quality: 'low' | 'medium' | 'high';
}

export class Kit implements Site {
	readonly group = new THREE.Group();
	readonly colliders: Capsule[] = [];
	readonly interactables: Interactable[] = [];
	readonly baseY: number;
	private readonly disposables: { dispose(): void }[] = [];
	private readonly batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
	private readonly solids = new Map<string, THREE.MeshStandardMaterial>();
	private readonly faces = new Map<THREE.Texture, THREE.MeshStandardMaterial>();
	private readonly updaters: ((t: number) => void)[] = [];
	private readonly matrix = new THREE.Matrix4();

	constructor(
		name: string,
		readonly spot: Spot,
		readonly ctx: KitContext
	) {
		this.group.name = name;
		this.baseY = ctx.heightAt(spot.x, spot.z);
		this.group.position.set(spot.x, this.baseY, spot.z);
		this.group.rotation.y = spot.yaw;
	}

	get shadows(): boolean {
		return this.ctx.quality !== 'low';
	}

	keep<T extends { dispose(): void }>(d: T): T {
		this.disposables.push(d);
		return d;
	}

	/** A plain material of one palette colour, shared by every piece that asks for the same look. */
	solid(color: number, roughness = 0.85, metalness = 0, emissive = 0, emissiveIntensity = 0): THREE.MeshStandardMaterial {
		const key = `${color}:${roughness}:${metalness}:${emissive}:${emissiveIntensity}`;
		let mat = this.solids.get(key);
		if (!mat) {
			mat = this.keep(new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: new THREE.Color(emissive), emissiveIntensity }));
			this.solids.set(key, mat);
		}
		return mat;
	}

	/** A material that shows a texture (a sign's face, a banner), one per texture. */
	face(texture: THREE.Texture, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
		let mat = this.faces.get(texture);
		if (!mat) {
			this.keep(texture);
			mat = this.keep(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, ...options }));
			this.faces.set(texture, mat);
		}
		return mat;
	}

	/**
	 * Queue a static piece at a local position; merged per material by build(). Rotations apply roll (z) and tilt (x)
	 * in the piece's own frame first, then turn it by `ry` — the order a builder thinks in.
	 */
	piece(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, scale = 1): void {
		this.matrix.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(scale, scale, scale));
		const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
		geometry.dispose();
		flat.applyMatrix4(this.matrix);
		for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') flat.deleteAttribute(name);
		const list = this.batches.get(material) ?? [];
		list.push(flat);
		this.batches.set(material, list);
	}

	box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): void {
		this.piece(new THREE.BoxGeometry(w, h, d), material, x, y, z, rx, ry, rz);
	}

	cyl(rTop: number, rBottom: number, h: number, material: THREE.Material, x: number, y: number, z: number, segments = 12, rx = 0, rz = 0): void {
		this.piece(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material, x, y, z, rx, 0, rz);
	}

	/** A textured rectangle facing local −z (towards the visitor), turned by `ry`. */
	plane(w: number, h: number, material: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0): void {
		this.piece(new THREE.PlaneGeometry(w, h), material, x, y, z, rx, Math.PI + ry, 0);
	}

	/** A mesh or group that moves (or needs its own draw), added as it is. */
	add<T extends THREE.Object3D>(object: T, x = 0, y = 0, z = 0): T {
		object.position.set(x, y, z);
		this.group.add(object);
		return object;
	}

	onUpdate(fn: (t: number) => void): void {
		this.updaters.push(fn);
	}

	/** Local → world on the ground plane. */
	world(lx: number, lz: number): { x: number; z: number } {
		return fromSpot(this.spot, lx, lz);
	}

	/** Height of the ground at a local point, relative to the landmark's base. */
	ground(lx: number, lz: number): number {
		const w = this.world(lx, lz);
		return this.ctx.heightAt(w.x, w.z) - this.baseY;
	}

	pillar(lx: number, lz: number, r: number): void {
		const w = this.world(lx, lz);
		this.colliders.push(pillar(w.x, w.z, r));
	}

	wall(ax: number, az: number, bx: number, bz: number, r = 0.12): void {
		const a = this.world(ax, az);
		const b = this.world(bx, bz);
		this.colliders.push(wall(a.x, a.z, b.x, b.z, r));
	}

	/** Four walls around a local rectangle, turned by `ry` inside the landmark's frame. */
	walls(lx: number, lz: number, w: number, d: number, ry = 0): void {
		const c = this.world(lx, lz);
		this.colliders.push(...boxWalls(c.x, c.z, w, d, this.spot.yaw + ry));
	}

	/** Something to read or look at with E: a tidbit from domain/tidbits.ts, anchored at a local point. */
	tidbit(id: string, lx: number, lz: number, y: number, radius = 2.4): void {
		const w = this.world(lx, lz);
		this.interactables.push({ id: `tidbit:${id}`, kind: 'tidbit', x: w.x, z: w.z, radius, y: this.baseY + y });
	}

	/**
	 * A painted sign on a wooden post, readable from local −z (turned by `ry`), with the same face on its back. When
	 * `tidbit` is given, E reads it.
	 */
	sign(texture: THREE.Texture, lx: number, lz: number, o: { ry?: number; w?: number; h?: number; post?: number; tidbit?: string } = {}): void {
		const { ry = 0, w = 1.5, h = 0.5, post = 1.5 } = o;
		const wood = this.solid(WOOD.plankDark, 0.9);
		const y0 = this.ground(lx, lz);
		const face = this.face(texture);
		const c = Math.cos(ry);
		const s = Math.sin(ry);
		const at = (u: number, v: number) => [lx + u * c + v * s, lz - u * s + v * c] as const;
		for (const side of [-1, 1]) {
			const [px, pz] = at(side * (w / 2 - 0.08), 0);
			this.cyl(0.06, 0.07, post + h, wood, px, y0 + (post + h) / 2, pz, 6);
		}
		const [bx, bz] = at(0, 0);
		this.box(w, h, 0.06, wood, bx, y0 + post + h / 2 - 0.02, bz, ry);
		const [fx, fz] = at(0, -0.035);
		this.plane(w - 0.06, h - 0.06, face, fx, y0 + post + h / 2 - 0.02, fz, ry);
		const [kx, kz] = at(0, 0.035);
		this.plane(w - 0.06, h - 0.06, face, kx, y0 + post + h / 2 - 0.02, kz, ry + Math.PI);
		this.pillar(lx, lz, w / 2);
		if (o.tidbit) this.tidbit(o.tidbit, lx, lz, y0 + post, 2.6);
	}

	/** A hanging cloth (a banner, a gonfalon) pinned along its top edge and stirring in the wind; faces local −z. */
	cloth(texture: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry = 0, wind = 0.6): void {
		const material = this.keep(
			new THREE.ShaderMaterial({
				uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uWind: { value: wind }, uMap: { value: null }, uTint: { value: new THREE.Color(1, 1, 1) } }]),
				vertexShader: clothVertex,
				fragmentShader: clothFragment,
				side: THREE.DoubleSide,
				fog: true
			})
		);
		material.uniforms.uMap.value = this.keep(texture);
		const mesh = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(w, h, 2, 10)), material);
		mesh.rotation.y = Math.PI + ry;
		this.add(mesh, x, y, z);
		this.onUpdate((t) => (material.uniforms.uTime.value = t));
	}

	/** Merge the queued pieces: one mesh per material. Call once, after the last piece. */
	build(): this {
		for (const [material, geometries] of this.batches) {
			const merged = mergeGeometries(geometries, false);
			for (const g of geometries) g.dispose();
			if (!merged) continue;
			this.keep(merged);
			const mesh = new THREE.Mesh(merged, material);
			const see = material as THREE.MeshStandardMaterial;
			mesh.castShadow = this.shadows && !see.transparent;
			mesh.receiveShadow = true;
			this.group.add(mesh);
		}
		this.batches.clear();
		return this;
	}

	update(t: number): void {
		for (const fn of this.updaters) fn(t);
	}

	dispose(): void {
		for (const d of this.disposables) d.dispose();
	}
}

/**
 * A goal: posts at (x, z), a crossbar, a base frame and netting sloping back from the crossbar, the whole thing turned
 * by `ry` so its netting lies along +v. Used for the rink's hockey nets and Cuenca's soccer goal.
 */
export function goal(kit: Kit, frame: THREE.Material, mesh: THREE.Material, x: number, z: number, ry: number, y: number, size: { w: number; h: number; d: number; bar: number }): void {
	const { w, h, d, bar } = size;
	const c = Math.cos(ry);
	const s = Math.sin(ry);
	const at = (u: number, v: number) => [x + u * c + v * s, z - u * s + v * c] as const;
	for (const side of [-1, 1]) {
		const [px, pz] = at((side * w) / 2, 0);
		kit.cyl(bar, bar, h, frame, px, y + h / 2, pz, 8);
		const [bx, bz] = at((side * w) / 2, d / 2);
		kit.box(bar * 1.4, bar * 1.4, d, frame, bx, y + bar, bz, ry);
		kit.piece(new THREE.PlaneGeometry(d, h), mesh, bx, y + h / 2, bz, 0, ry + Math.PI / 2, 0);
	}
	const [cx, cz] = at(0, 0);
	kit.box(w + bar * 2, bar * 2, bar * 2, frame, cx, y + h, cz, ry);
	const [kx, kz] = at(0, d);
	kit.box(w + bar * 2, bar * 1.4, bar * 1.4, frame, kx, y + bar, kz, ry);
	const [nx, nz] = at(0, d / 2);
	kit.piece(new THREE.PlaneGeometry(w, Math.hypot(h, d)), mesh, nx, y + h / 2, nz, -Math.atan2(d, h), ry, 0);
	kit.walls(nx, nz, w + 0.2, d + 0.15, ry);
}

/** A dome: the upper half of a sphere, its texture spread from the rim (v = 0) to the crown (v = 1). */
export function dome(radius: number, segments = 32): THREE.BufferGeometry {
	const geometry = new THREE.SphereGeometry(radius, segments, Math.max(6, segments / 3), 0, Math.PI * 2, 0, Math.PI / 2);
	const uv = geometry.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) - 0.5) * 2);
	return geometry;
}
