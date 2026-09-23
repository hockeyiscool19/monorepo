// Colorado, outside the Get-a-way's window: twin maroon fourteeners streaked with snow (after the Maroon
// Bells), a mirror lake, golden aspens and dark spruce, a meadow of columbines, cumulus drifting over a
// hazy far range, and a hawk riding the thermals. A diorama in the same scene, so it has true parallax.

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { noise2, rng, smoothstep } from '../noise';
import { COLORADO } from '../palette';
import type { Quality } from '../space';
import { softDot } from '../textures/common';
import { cloud } from '../textures/room';

export interface Colorado {
	group: THREE.Group;
	sunDirection: THREE.Vector3;
	update(t: number): void;
	dispose(): void;
}

function vertexColours(geometry: THREE.BufferGeometry, fn: (x: number, y: number, z: number, ny: number) => THREE.Color): void {
	geometry.computeVertexNormals();
	const pos = geometry.attributes.position;
	const nrm = geometry.attributes.normal;
	const out = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i++) {
		const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i));
		out.set([c.r, c.g, c.b], i * 3);
	}
	geometry.setAttribute('color', new THREE.BufferAttribute(out, 3));
}

export function buildColorado(quality: Quality): Colorado {
	const group = new THREE.Group();
	group.name = 'colorado';
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
	const n = noise2(1876);
	const rand = rng(14);
	const sunDirection = new THREE.Vector3(0.55, 0.62, -0.56).normalize();

	// Daylight sky with a warm glow around the sun.
	const skyMat = keep(
		new THREE.ShaderMaterial({
			uniforms: {
				uTop: { value: new THREE.Color(COLORADO.skyTop) },
				uHorizon: { value: new THREE.Color(COLORADO.skyHorizon) },
				uSun: { value: new THREE.Color(COLORADO.sun) },
				uSunDir: { value: sunDirection }
			},
			vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: /* glsl */ `
				uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; varying vec3 vDir;
				void main() {
					vec3 d = normalize(vDir);
					vec3 col = mix(uHorizon, uTop, smoothstep(-0.05, 0.6, d.y));
					float s = max(0.0, dot(d, normalize(uSunDir)));
					col += uSun * (pow(s, 600.0) * 2.2 + pow(s, 16.0) * 0.18);
					gl_FragColor = vec4(col, 1.0);
				}`,
			side: THREE.BackSide,
			depthWrite: false,
			fog: false
		})
	);
	const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(700, 32, 16)), skyMat);
	sky.renderOrder = -1;
	group.add(sky);

	// Far ranges: flat, hazy silhouettes, lighter with distance.
	COLORADO.distant.forEach((hex, i) => {
		const shape = new THREE.Shape();
		shape.moveTo(-700, -10);
		for (let x = -700; x <= 700; x += 20) shape.lineTo(x, 34 - i * 6 + 30 * n.ridged(x * 0.004 + i * 5, i * 3.1, 4) + 8 * n.at(x * 0.02, i));
		shape.lineTo(700, -10);
		const mesh = new THREE.Mesh(keep(new THREE.ShapeGeometry(shape)), keep(new THREE.MeshBasicMaterial({ color: hex, fog: false })));
		mesh.position.set(0, 0, -640 + i * 50);
		group.add(mesh);
	});

	// The twin peaks: a heightfield of maroon rock, snow in the couloirs, scree and spruce at the foot.
	// Framed by the window: the summits sit 5–8° above the horizon seen from inside the room.
	const peaks = [
		{ x: -46, z: -452, h: 64, r: 58 },
		{ x: 30, z: -430, h: 58, r: 52 }
	];
	const ridgeHeight = (x: number, z: number) => {
		let h = 0;
		for (const p of peaks) {
			const d = Math.hypot(x - p.x, (z - p.z) * 1.2);
			h = Math.max(h, p.h * Math.pow(Math.max(0, 1 - d / (p.r * 2.1)), 1.7));
		}
		h += 22 * smoothstep(-300, -520, z) * (0.5 + 0.5 * n.ridged(x * 0.008, z * 0.008, 4));
		h += 8 * n.ridged(x * 0.03, z * 0.03, 4) * smoothstep(0, 40, h);
		return h * smoothstep(-200, -290, z);
	};
	const segs = quality === 'low' ? 90 : 150;
	const mountainGeo = keep(new THREE.PlaneGeometry(900, 380, segs, Math.round(segs * 0.5)));
	mountainGeo.rotateX(-Math.PI / 2);
	mountainGeo.translate(0, 0, -420);
	const mpos = mountainGeo.attributes.position;
	for (let i = 0; i < mpos.count; i++) mpos.setY(i, ridgeHeight(mpos.getX(i), mpos.getZ(i)) - 2);
	const maroon = new THREE.Color(COLORADO.maroon);
	const maroonDark = new THREE.Color(COLORADO.maroonDark);
	const snow = new THREE.Color(COLORADO.snow);
	const scree = new THREE.Color(COLORADO.scree);
	const spruce = new THREE.Color(COLORADO.spruce);
	vertexColours(mountainGeo, (x, y, z, ny) => {
		const strata = 0.5 + 0.5 * Math.sin(y * 1.3 + n.at(x * 0.05, z * 0.05) * 2);
		const c = maroon.clone().lerp(maroonDark, strata * 0.6);
		const couloir = smoothstep(0.35, 0.75, n.fbm(x * 0.06, y * 0.14, 3) + (ny - 0.55) * 0.8) * smoothstep(22, 42, y);
		c.lerp(snow, Math.min(1, couloir + smoothstep(52, 62, y)));
		c.lerp(scree, smoothstep(18, 5, y) * 0.7);
		return c.lerp(spruce, smoothstep(10, 2, y) * 0.85);
	});
	const mountains = new THREE.Mesh(mountainGeo, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })));
	group.add(mountains);

	// Valley floor: a meadow drying to gold, rising gently to the lake and the forest.
	const floorGeo = keep(new THREE.PlaneGeometry(600, 260, 80, 50));
	floorGeo.rotateX(-Math.PI / 2);
	floorGeo.translate(0, 0, -125);
	const fpos = floorGeo.attributes.position;
	for (let i = 0; i < fpos.count; i++) {
		const x = fpos.getX(i);
		const z = fpos.getZ(i);
		const lake = Math.hypot((x - 2) / 40, (z + 96) / 24);
		fpos.setY(i, -1.2 + 2.5 * n.fbm(x * 0.012, z * 0.012, 3) + smoothstep(20, 130, Math.abs(x)) * 14 - (lake < 1.2 ? 1.5 : 0));
	}
	const meadow = new THREE.Color(COLORADO.meadow);
	const dry = new THREE.Color(COLORADO.meadowDry);
	vertexColours(floorGeo, (x, _y, z) => meadow.clone().lerp(dry, 0.5 + 0.5 * n.fbm(x * 0.04, z * 0.04, 3)).lerp(spruce, smoothstep(-150, -200, z) * 0.6));
	const floor = new THREE.Mesh(floorGeo, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
	floor.position.y = -0.4;
	group.add(floor);

	// The lake mirrors the peaks (a true reflection on medium and high quality).
	const lakeGeo = keep(new THREE.CircleGeometry(1, 64));
	lakeGeo.scale(42, 26, 1);
	let lake: THREE.Mesh;
	if (quality !== 'low') {
		const mirror = new Reflector(lakeGeo, { textureWidth: 512, textureHeight: 512, color: new THREE.Color(COLORADO.lake), clipBias: 0.003 });
		keep({ dispose: () => mirror.dispose() });
		lake = mirror;
	} else {
		lake = new THREE.Mesh(lakeGeo, keep(new THREE.MeshStandardMaterial({ color: COLORADO.lake, roughness: 0.1, metalness: 0.4 })));
	}
	lake.rotation.x = -Math.PI / 2;
	lake.position.set(2, -1.6, -96);
	group.add(lake);

	// Aspens: white trunks and golden crowns in groves either side of the lake; spruce on the far slopes.
	const counts = quality === 'low' ? { aspen: 90, spruce: 80, flowers: 120 } : { aspen: 190, spruce: 170, flowers: 320 };
	const trunks = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.18, 0.26, 7, 5)), keep(new THREE.MeshStandardMaterial({ color: COLORADO.aspenTrunk, roughness: 0.8 })), counts.aspen);
	const crowns = new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1, 0)), keep(new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true })), counts.aspen);
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const tint = new THREE.Color();
	for (let i = 0; i < counts.aspen; i++) {
		const side = i % 2 ? 1 : -1;
		const x = side * (18 + Math.pow(rand(), 0.7) * 95);
		const z = -24 - rand() * 130;
		const y = -1.2 + 2.5 * n.fbm(x * 0.012, z * 0.012, 3) + smoothstep(20, 130, Math.abs(x)) * 14 - 0.4;
		const s = 0.7 + rand() * 0.6;
		q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
		trunks.setMatrixAt(i, m.compose(new THREE.Vector3(x, y + 3.5 * s, z), q, new THREE.Vector3(s, s, s)));
		crowns.setMatrixAt(i, m.compose(new THREE.Vector3(x, y + 7.4 * s, z), q, new THREE.Vector3(2.3 * s, 3.4 * s, 2.3 * s)));
		crowns.setColorAt(i, tint.set(COLORADO.aspenGold[Math.floor(rand() * COLORADO.aspenGold.length)]));
	}
	group.add(trunks, crowns);
	const spruces = new THREE.InstancedMesh(keep(new THREE.ConeGeometry(2.2, 11, 7)), keep(new THREE.MeshStandardMaterial({ color: COLORADO.spruce, roughness: 0.9 })), counts.spruce);
	for (let i = 0; i < counts.spruce; i++) {
		const x = (rand() - 0.5) * 420;
		const z = -150 - rand() * 150;
		const s = 0.6 + rand() * 0.8;
		spruces.setMatrixAt(i, m.compose(new THREE.Vector3(x, ridgeHeight(x, z) + 4 * s + smoothstep(20, 130, Math.abs(x)) * 10, z), q, new THREE.Vector3(s, s, s)));
	}
	group.add(spruces);

	// Columbines (the state flower) scattered in the near meadow.
	const flowerGeo = keep(new THREE.BufferGeometry());
	const fp = new Float32Array(counts.flowers * 3);
	const fc = new Float32Array(counts.flowers * 3);
	for (let i = 0; i < counts.flowers; i++) {
		fp.set([(rand() - 0.5) * 60, -0.9 + rand() * 0.3, -5 - rand() * 36], i * 3);
		const c = new THREE.Color(COLORADO.columbine[Math.floor(rand() * COLORADO.columbine.length)]);
		fc.set([c.r, c.g, c.b], i * 3);
	}
	flowerGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
	flowerGeo.setAttribute('color', new THREE.BufferAttribute(fc, 3));
	// Round blossoms, not square pixels: a soft dot sprite, cut out with alphaTest.
	group.add(new THREE.Points(flowerGeo, keep(new THREE.PointsMaterial({ size: 0.3, vertexColors: true, map: keep(softDot(32, 0.6)), alphaTest: 0.5, transparent: false }))));

	// Cumulus sprites and a hawk.
	const clouds: THREE.Sprite[] = [];
	for (let i = 0; i < 9; i++) {
		const mat = keep(new THREE.SpriteMaterial({ map: keep(cloud(i + 3)), transparent: true, depthWrite: false, fog: false, opacity: 0.92 }));
		const sprite = new THREE.Sprite(mat);
		sprite.position.set(-320 + i * 80 + rand() * 30, 52 + rand() * 38, -520 - rand() * 120);
		sprite.userData.x = sprite.position.x;
		sprite.scale.set(120 + rand() * 70, 46 + rand() * 20, 1);
		clouds.push(sprite);
		group.add(sprite);
	}
	const hawk = new THREE.Mesh(
		keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.4, 0.3, 0), new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(1.4, 0.3, 0), new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(0, 0, -0.5)])),
		keep(new THREE.MeshBasicMaterial({ color: COLORADO.maroonDark, side: THREE.DoubleSide }))
	);
	group.add(hawk);

	return {
		group,
		sunDirection,
		update(t) {
			clouds.forEach((c, i) => {
				const drift = t * 1.2 * (1 + (i % 3) * 0.3);
				c.position.x = ((((c.userData.x as number) + drift + 420) % 840) + 840) % 840 - 420;
			});
			const a = t * 0.12;
			hawk.position.set(8 + Math.cos(a) * 22, 13 + Math.sin(a * 2) * 2, -120 + Math.sin(a) * 16);
			hawk.rotation.set(0, -a, 0.3);
			hawk.scale.y = 1 + Math.sin(t * 5) * 0.4;
		},
		dispose() {
			for (const d of disposables) d.dispose();
		}
	};
}
