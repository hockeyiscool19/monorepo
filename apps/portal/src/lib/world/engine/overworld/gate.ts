// One gateway: rune-carved pillars, a lintel with the app's name, a swirling portal in the app's colour,
// braziers and banners — and, when the UI says so, a crimson ward across the opening that the player
// cannot walk through. The engine only draws what the access rules decided.

import * as THREE from 'three';
import { pillar, wall, type Capsule } from '../../domain/collide';
import type { PlacedGate } from '../../domain/realm';
import { FIRE, hueHex, STONE, WARD, WOOD } from '../palette';
import { fire as fireParticles, type Particles } from '../particles';
import { clothFragment, clothVertex, portalFragment, uvVertex, wardFragment } from '../shaders';
import type { GateLook, Interactable, Trigger } from '../space';
import { banner, plaque, runePillar, stoneTexture } from '../textures/realm';

export interface GateObject {
	group: THREE.Group;
	colliders: Capsule[];
	trigger: Trigger;
	interactable: Interactable;
	wardTag: string;
	fires: { x: number; z: number }[];
	setLook(look: GateLook): void;
	update(t: number, dt: number): void;
	dispose(): void;
}

const PORTAL_W = 2.7;
const PORTAL_H = 4.6;

export function buildGate(placed: PlacedGate, groundY: number, pixelRatio: number, quality: 'low' | 'medium' | 'high'): GateObject {
	const { gate, spot, hue } = placed;
	const group = new THREE.Group();
	group.name = `gate:${gate.id}`;
	group.position.set(spot.x, groundY, spot.z);
	group.rotation.y = spot.yaw;
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);

	const colour = new THREE.Color(hueHex(hue, 0.8, 0.55));
	const colourB = new THREE.Color(hueHex((hue + 0.08) % 1, 0.9, 0.7));
	const dark = hueHex(hue, 0.55, 0.22);

	// Stone: platform, plinths, shafts, capitals, lintel, keystone.
	const stoneMap = keep(stoneTexture(hue * 1000 + 3, [2, 1]));
	const stone = keep(new THREE.MeshStandardMaterial({ map: stoneMap, roughness: 0.9, color: STONE.light }));
	const runes = runePillar(Math.floor(hue * 997));
	keep(runes.map);
	keep(runes.glow);
	const shaftMat = keep(
		new THREE.MeshStandardMaterial({ map: runes.map, emissiveMap: runes.glow, emissive: colour.clone(), emissiveIntensity: 1.4, roughness: 0.85 })
	);
	const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
		const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
		mesh.position.set(x, y, z);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		group.add(mesh);
		return mesh;
	};
	box(7.2, 0.14, 4.2, 0, 0.05, 0, stone);
	box(5.2, 0.1, 1.2, 0, 0.04, -2.5, stone);
	for (const side of [-1, 1]) {
		const x = side * 1.85;
		box(1.45, 0.62, 1.45, x, 0.4, 0, stone);
		box(1.0, 4.6, 1.0, x, 3.0, 0, shaftMat);
		box(1.35, 0.45, 1.35, x, 5.52, 0, stone);
	}
	box(5.5, 0.95, 1.45, 0, 6.2, 0, stone);
	box(0.95, 1.25, 1.6, 0, 6.75, 0, stone);

	// Name plaque on the front of the lintel (front = local −z, towards the square).
	const sub = gate.status === 'planned' ? 'Dormant' : gate.status === 'beta' ? `Beta · ${gate.version ?? ''}` : (gate.version ?? '');
	const plaqueTex = keep(plaque(gate.name, sub));
	const plaqueMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.2, 1.05)), keep(new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.8 })));
	plaqueMesh.position.set(0, 6.2, -0.735);
	plaqueMesh.rotation.y = Math.PI;
	group.add(plaqueMesh);

	// The portal and its ward.
	const portalMat = keep(
		new THREE.ShaderMaterial({
			uniforms: {
				uTime: { value: 0 },
				uColorA: { value: colour },
				uColorB: { value: colourB },
				uState: { value: 1 },
				uAspect: { value: PORTAL_W / PORTAL_H }
			},
			vertexShader: uvVertex,
			fragmentShader: portalFragment,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.AdditiveBlending
		})
	);
	const portal = new THREE.Mesh(keep(new THREE.PlaneGeometry(PORTAL_W, PORTAL_H)), portalMat);
	portal.position.set(0, 0.7 + PORTAL_H / 2, 0);
	group.add(portal);

	const wardMat = keep(
		new THREE.ShaderMaterial({
			uniforms: {
				uTime: { value: 0 },
				uColor: { value: new THREE.Color(WARD.sealed) },
				uOpacity: { value: 0 },
				uAspect: { value: 3.1 / 5.2 }
			},
			vertexShader: uvVertex,
			fragmentShader: wardFragment,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.AdditiveBlending
		})
	);
	const ward = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.1, 5.2)), wardMat);
	ward.position.set(0, 0.6 + 2.6, -0.35);
	ward.visible = false;
	group.add(ward);

	// Banners on the pillar fronts, fluttering.
	const bannerTex = keep(banner(gate.icon, hueHex(hue, 0.6, 0.35), dark));
	const clothMat = keep(
		new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge([
				THREE.UniformsLib.fog,
				{ uTime: { value: 0 }, uWind: { value: 1 }, uMap: { value: bannerTex }, uTint: { value: new THREE.Color(1, 1, 1) } }
			]),
			vertexShader: clothVertex,
			fragmentShader: clothFragment,
			side: THREE.DoubleSide,
			fog: true
		})
	);
	const clothGeo = keep(new THREE.PlaneGeometry(0.95, 2.1, 2, 10));
	for (const side of [-1, 1]) {
		const cloth = new THREE.Mesh(clothGeo, clothMat);
		cloth.position.set(side * 1.85, 4.15, -0.56);
		cloth.rotation.y = Math.PI;
		group.add(cloth);
	}

	// Braziers: tripod, bowl, fire, light.
	const iron = keep(new THREE.MeshStandardMaterial({ color: STONE.iron, roughness: 0.6, metalness: 0.7 }));
	const coals = keep(new THREE.MeshStandardMaterial({ color: WOOD.logDark, emissive: new THREE.Color(FIRE.ember), emissiveIntensity: 1.2 }));
	const legGeo = keep(new THREE.CylinderGeometry(0.035, 0.05, 1.1, 5));
	const bowlGeo = keep(new THREE.CylinderGeometry(0.46, 0.28, 0.32, 10, 1, true));
	const coalGeo = keep(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 10));
	const flames: Particles[] = [];
	const lights: THREE.PointLight[] = [];
	const fires: { x: number; z: number }[] = [];
	for (const side of [-1, 1]) {
		const b = new THREE.Group();
		b.position.set(side * 3.25, 0, -1.7);
		for (let i = 0; i < 3; i++) {
			const a = (i / 3) * Math.PI * 2;
			const leg = new THREE.Mesh(legGeo, iron);
			leg.position.set(Math.cos(a) * 0.22, 0.55, Math.sin(a) * 0.22);
			leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
			b.add(leg);
		}
		const bowl = new THREE.Mesh(bowlGeo, iron);
		bowl.position.y = 1.2;
		bowl.castShadow = true;
		b.add(bowl);
		const coal = new THREE.Mesh(coalGeo, coals);
		coal.position.y = 1.3;
		b.add(coal);
		const flame = fireParticles({
			count: quality === 'low' ? 40 : 80,
			seed: Math.floor(hue * 100) + side + 5,
			radius: 0.32,
			height: 1.35,
			size: 150,
			core: new THREE.Color(FIRE.core),
			flame: new THREE.Color(FIRE.flame),
			ember: new THREE.Color(FIRE.ember),
			pixelRatio
		});
		flame.points.position.y = 1.3;
		b.add(flame.points);
		flames.push(flame);
		const light = new THREE.PointLight(FIRE.light, 14, 16, 1.8);
		light.position.y = 2.0;
		b.add(light);
		lights.push(light);
		group.add(b);
		fires.push(localToWorld(side * 3.25, -1.7));
	}

	function localToWorld(lx: number, lz: number): { x: number; z: number } {
		const c = Math.cos(spot.yaw);
		const s = Math.sin(spot.yaw);
		return { x: spot.x + lx * c + lz * s, z: spot.z - lx * s + lz * c };
	}

	const wardTag = `ward:${gate.id}`;
	const colliders: Capsule[] = [];
	for (const side of [-1, 1]) {
		const p = localToWorld(side * 1.85, 0);
		colliders.push(pillar(p.x, p.z, 0.78));
		const f = localToWorld(side * 3.25, -1.7);
		colliders.push(pillar(f.x, f.z, 0.4));
	}
	const l = localToWorld(-1.35, 0);
	const r = localToWorld(1.35, 0);
	colliders.push(wall(l.x, l.z, r.x, r.z, 0.3, wardTag));
	const t0 = localToWorld(-1.3, 0);
	const t1 = localToWorld(1.3, 0);

	let look: GateLook = 'open';
	let wardTarget = 0;
	const base = { emissive: colour.clone(), sealed: new THREE.Color(WARD.sealed) };

	function setLook(next: GateLook): void {
		look = next;
		const lit = next !== 'dormant';
		portalMat.uniforms.uState.value = next === 'open' ? 1 : next === 'unstable' ? 0.35 : next === 'sealed' ? 0.45 : 0;
		portal.visible = lit;
		wardTarget = next === 'sealed' ? 1 : 0;
		shaftMat.emissive.copy(next === 'sealed' ? base.sealed : base.emissive);
		shaftMat.emissiveIntensity = next === 'dormant' ? 0 : next === 'sealed' ? 0.9 : next === 'unstable' ? 0.5 : 1.4;
		for (const f of flames) f.points.visible = lit;
		for (const light of lights) light.visible = lit;
		coals.emissiveIntensity = lit ? 1.2 : 0;
	}
	setLook(gate.status === 'planned' ? 'dormant' : 'open');

	return {
		group,
		colliders,
		trigger: { id: `gate:${gate.id}`, capsule: wall(t0.x, t0.z, t1.x, t1.z, 0) },
		interactable: { id: `gate:${gate.id}`, kind: 'gate', x: spot.x, z: spot.z, radius: 8.5, y: 2.6 },
		wardTag,
		fires,
		setLook,
		update(t, dt) {
			portalMat.uniforms.uTime.value = t;
			wardMat.uniforms.uTime.value = t;
			clothMat.uniforms.uTime.value = t;
			const o = wardMat.uniforms.uOpacity;
			o.value += (wardTarget - o.value) * Math.min(1, dt * 3);
			ward.visible = o.value > 0.01;
			for (const f of flames) f.update(t);
			lights.forEach((light, i) => {
				light.intensity = look === 'dormant' ? 0 : 12 + Math.sin(t * 9.1 + i * 2) * 1.6 + Math.sin(t * 23.7 + i) * 1.1;
			});
		},
		dispose() {
			for (const f of flames) f.dispose();
			for (const d of disposables) d.dispose();
		}
	};
}
