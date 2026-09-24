// The Heartcell: the mythical battery over the dais at the centre of Eisenhold. A 4680 cell grown taller than the
// guard, its charge rings filling from the bottom up, gilded orbits turning around it, a stream of light rising
// into it and arcs cracking down to the rune ring — and, south of it, the stone lectern that tells the legend of
// the panel, with the relic itself on top.

import * as THREE from 'three';
import type { RealmLayout } from '../../../domain/realm';
import { rng } from '../../noise';
import { CELL, STONE } from '../../palette';
import { motes } from '../../particles';
import { beamFragment, uvVertex } from '../../shaders';
import { softDot } from '../../textures/common';
import { cellWrap, legendPlaque, relicCells } from '../../textures/landmarks';
import { Kit, type KitContext, type Site } from './kit';

/** Where the cell floats (its centre), how tall it is, and the dais it floats over. */
const FLOAT = 3.9;
const RADIUS = 0.62;
const HEIGHT = 2.1;
const DAIS_TOP = 0.43;
const RINGS = [-0.62, -0.4, -0.18, 0.04, 0.26];

function buildCell(kit: Kit): { cell: THREE.Group; update(t: number): void } {
	const keep = <T extends { dispose(): void }>(d: T) => kit.keep(d);
	const cell = new THREE.Group();
	cell.name = 'heartcell';
	const wrap = cellWrap();
	keep(wrap.map);
	keep(wrap.glow);
	const can = new THREE.Mesh(
		keep(new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 48, 1, true)),
		keep(new THREE.MeshStandardMaterial({ map: wrap.map, emissiveMap: wrap.glow, emissive: new THREE.Color(CELL.charge), emissiveIntensity: 1.2, metalness: 0.55, roughness: 0.35 }))
	);
	can.castShadow = kit.shadows;
	cell.add(can);
	const steel = keep(new THREE.MeshStandardMaterial({ color: CELL.steel, metalness: 0.85, roughness: 0.28 }));
	const steelDark = keep(new THREE.MeshStandardMaterial({ color: CELL.steelDark, metalness: 0.8, roughness: 0.4 }));
	const capGeo = keep(new THREE.CircleGeometry(RADIUS, 48));
	const top = new THREE.Mesh(capGeo, steel);
	top.rotation.x = -Math.PI / 2;
	top.position.y = HEIGHT / 2;
	const bottom = new THREE.Mesh(capGeo, steelDark);
	bottom.rotation.x = Math.PI / 2;
	bottom.position.y = -HEIGHT / 2;
	cell.add(top, bottom);
	const rimGeo = keep(new THREE.TorusGeometry(RADIUS - 0.01, 0.035, 8, 48));
	for (const y of [HEIGHT / 2, -HEIGHT / 2]) {
		const rim = new THREE.Mesh(rimGeo, steel);
		rim.rotation.x = Math.PI / 2;
		rim.position.y = y;
		cell.add(rim);
	}
	// The positive terminal, with a gold + that glows.
	const terminal = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 32)), steel);
	terminal.position.y = HEIGHT / 2 + 0.07;
	cell.add(terminal);
	const gold = keep(new THREE.MeshStandardMaterial({ color: STONE.gold, emissive: new THREE.Color(STONE.gold), emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.3 }));
	for (const r of [0, Math.PI / 2]) {
		const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 0.02, 0.06)), gold);
		bar.position.y = HEIGHT / 2 + 0.15;
		bar.rotation.y = r;
		cell.add(bar);
	}

	// Charge rings: they fill from the bottom, hold full for a beat, then drain and fill again.
	const ringGeo = keep(new THREE.CylinderGeometry(RADIUS + 0.018, RADIUS + 0.018, 0.1, 48, 1, true));
	const ringMats = RINGS.map(() => keep(new THREE.MeshStandardMaterial({ color: CELL.chargeDeep, emissive: new THREE.Color(CELL.charge), emissiveIntensity: 2.4, roughness: 0.4 })));
	RINGS.forEach((y, i) => {
		const ring = new THREE.Mesh(ringGeo, ringMats[i]);
		ring.position.y = y;
		cell.add(ring);
	});

	// Gilded orbits, a halo and the motes that drift around the cell.
	const orbitGeo = keep(new THREE.TorusGeometry(1.05, 0.022, 6, 120));
	const orbits = [0.5, -0.9].map((tilt) => {
		const pivot = new THREE.Group();
		pivot.rotation.set(tilt, 0, tilt * 0.6);
		pivot.add(new THREE.Mesh(orbitGeo, gold));
		cell.add(pivot);
		return pivot;
	});
	const halo = new THREE.Sprite(
		keep(new THREE.SpriteMaterial({ map: keep(softDot(64, 0.05)), color: CELL.charge, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }))
	);
	halo.scale.setScalar(4.2);
	cell.add(halo);
	const sparks = motes({ count: kit.ctx.quality === 'low' ? 30 : 70, box: [3.4, 3.2, 3.4], color: new THREE.Color(CELL.charge), pixelRatio: kit.ctx.pixelRatio });
	keep(sparks);
	cell.add(sparks.points);
	const light = new THREE.PointLight(CELL.charge, 8, 16, 1.8);
	cell.add(light);

	return {
		cell,
		update(t) {
			cell.position.y = FLOAT + Math.sin(t * 1.1) * 0.12;
			cell.rotation.y = t * 0.35;
			orbits[0].rotation.y = t * 0.7;
			orbits[1].rotation.y = -t * 0.45;
			sparks.update(t);
			// Frozen time (reduced motion) shows it full: the phase starts where every ring is lit.
			const level = ((t * 0.42 + 0.99) % 1.35) / 1.1;
			ringMats.forEach((mat, i) => {
				const lit = level >= (i + 1) / RINGS.length;
				const front = !lit && level >= i / RINGS.length;
				mat.emissiveIntensity = lit ? 2.4 : front ? 0.6 + 1.6 * ((level * RINGS.length) % 1) : 0.15;
			});
			light.intensity = 7 + Math.sin(t * 2.3) * 0.8;
		}
	};
}

/** Three jagged arcs from the rune ring up to the cell, re-struck several times a second (held still when time is). */
function buildArcs(kit: Kit): { lines: THREE.LineSegments; update(t: number): void } {
	const BOLTS = 3;
	const STEPS = 10;
	const positions = new Float32Array(BOLTS * STEPS * 2 * 3);
	const geometry = kit.keep(new THREE.BufferGeometry());
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 4);
	const color = new THREE.Color(CELL.spark).multiplyScalar(2.2);
	const material = kit.keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
	const lines = new THREE.LineSegments(geometry, material);
	let struck = -1;
	return {
		lines,
		update(t) {
			const tick = Math.floor(t / 0.09);
			if (tick === struck) return;
			struck = tick;
			const rand = rng(tick + 7);
			let k = 0;
			for (let b = 0; b < BOLTS; b++) {
				const a = rand() * Math.PI * 2;
				const from = new THREE.Vector3(Math.cos(a) * 1.9, DAIS_TOP + 0.02, Math.sin(a) * 1.9);
				const b2 = a + (rand() - 0.5) * 1.2;
				const to = new THREE.Vector3(Math.cos(b2) * RADIUS * 0.8, FLOAT - HEIGHT / 2 - 0.02, Math.sin(b2) * RADIUS * 0.8);
				let prev = from;
				for (let s = 1; s <= STEPS; s++) {
					const next = from.clone().lerp(to, s / STEPS);
					if (s < STEPS) next.add(new THREE.Vector3((rand() - 0.5) * 0.35, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.35));
					positions.set([prev.x, prev.y, prev.z, next.x, next.y, next.z], k);
					k += 6;
					prev = next;
				}
			}
			geometry.attributes.position.needsUpdate = true;
			material.opacity = 0.55 + rand() * 0.4;
		}
	};
}

/** The Heartcell over the dais: interactable from all around the dais, humming like a gate. */
export function buildHeartcell(layout: RealmLayout, ctx: KitContext): Site {
	const kit = new Kit('heartcell', layout.heartcell, ctx);
	const { cell, update: updateCell } = buildCell(kit);
	kit.add(cell, 0, FLOAT, 0);
	const beamMat = kit.keep(
		new THREE.ShaderMaterial({
			uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(CELL.chargeDeep) }, uCore: { value: new THREE.Color(CELL.spark) } },
			vertexShader: uvVertex,
			fragmentShader: beamFragment,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.AdditiveBlending
		})
	);
	const beamHeight = FLOAT - HEIGHT / 2 - DAIS_TOP;
	kit.add(new THREE.Mesh(kit.keep(new THREE.CylinderGeometry(0.2, 0.46, beamHeight, 32, 1, true)), beamMat), 0, DAIS_TOP + beamHeight / 2, 0);
	const arcs = buildArcs(kit);
	kit.add(arcs.lines);
	kit.interactables.push({ id: 'tidbit:heartcell', kind: 'tidbit', x: layout.heartcell.x, z: layout.heartcell.z, radius: 4.8, y: FLOAT });
	kit.onUpdate((t) => {
		updateCell(t);
		arcs.update(t);
		beamMat.uniforms.uTime.value = t;
	});
	return kit;
}

/** The lectern south of the dais: the legend of the panel carved on its face, the relic panel on its slanted top. */
export function buildLectern(layout: RealmLayout, ctx: KitContext): Site {
	const kit = new Kit('legend-lectern', layout.lectern, ctx);
	const stone = kit.solid(STONE.light, 0.9);
	const dark = kit.solid(STONE.mid, 0.9);
	kit.box(1.5, 0.22, 1.0, dark, 0, 0.11, 0);
	kit.box(1.24, 1.0, 0.52, stone, 0, 0.72, 0);
	kit.box(1.34, 0.1, 0.84, dark, 0, 1.27, -0.05, 0, -0.4);
	const plaque = legendPlaque();
	kit.keep(plaque.glow);
	kit.plane(1.14, 0.71, kit.face(plaque.map, { roughness: 0.8, emissiveMap: plaque.glow, emissive: new THREE.Color(CELL.charge), emissiveIntensity: 0.55 }), 0, 0.72, -0.265);
	const relic = relicCells();
	kit.keep(relic.glow);
	const relicMat = kit.face(relic.map, { emissiveMap: relic.glow, emissive: new THREE.Color(CELL.chargeDeep), emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.3 });
	kit.piece(new THREE.PlaneGeometry(1.08, 0.66), relicMat, 0, 1.335, -0.07, -(Math.PI / 2 + 0.4), 0, 0);
	kit.pillar(0, 0, 0.72);
	// Readable from a few paces back, where fast travel sets you down, with the Heartcell above it.
	kit.tidbit('legend-of-the-panel', 0, 0, 1.0, 4.2);
	return kit.build();
}
