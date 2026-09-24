// Stillwater Pond Rink: pond hockey on the frozen pond — plywood boards with a gap to walk in, two nets, pucks on
// the ice, a stick left against the boards, string lights between log posts and a bench. Somewhere out past the far
// net, a puck lies frozen in a drift: the lost puck.

import * as THREE from 'three';
import type { PlacedLandmark } from '../../../domain/realm';
import { rng } from '../../noise';
import { NIGHT, RINK, WOOD } from '../../palette';
import { softDot } from '../../textures/common';
import { netMesh, paintedBoard, rinkBoards } from '../../textures/landmarks';
import { goal, Kit, type KitContext, type Site } from './kit';

const ICE = 7.2;
const BOARDS = 6.4;
const SEGMENTS = 28;
const LIGHT_POSTS = 6;

/** Bulbs hung in sagging strings between the light posts, and the wire they hang on. */
function stringLights(kit: Kit, posts: { x: number; z: number; y: number }[]): void {
	const perSpan = 11;
	const bulbs = new THREE.InstancedMesh(
		kit.keep(new THREE.SphereGeometry(0.055, 8, 6)),
		kit.keep(new THREE.MeshStandardMaterial({ color: RINK.bulb, emissive: new THREE.Color(RINK.bulb), emissiveIntensity: 1.8 })),
		posts.length * perSpan
	);
	const wire: number[] = [];
	const m = new THREE.Matrix4();
	let n = 0;
	posts.forEach((a, i) => {
		const b = posts[(i + 1) % posts.length];
		let prev: [number, number, number] | null = null;
		for (let k = 0; k <= perSpan; k++) {
			const f = k / perSpan;
			const p: [number, number, number] = [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * 0.55, a.z + (b.z - a.z) * f];
			if (prev) wire.push(...prev, ...p);
			prev = p;
			if (k > 0 && k < perSpan + 1 && n < bulbs.count) bulbs.setMatrixAt(n++, m.makeTranslation(p[0], p[1] - 0.07, p[2]));
		}
	});
	bulbs.count = n;
	kit.add(bulbs);
	const geometry = kit.keep(new THREE.BufferGeometry());
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
	kit.add(new THREE.LineSegments(geometry, kit.keep(new THREE.LineBasicMaterial({ color: RINK.wire }))));
}

export function buildRink(landmark: PlacedLandmark, ctx: KitContext): Site {
	const kit = new Kit('rink', landmark.spot, ctx);
	const rand = rng(19);
	// The ice sits a hand above the pond's floor, as it did before the rink was built on it.
	const iceY = 0.15;
	const ice = kit.keep(new THREE.MeshStandardMaterial({ color: RINK.ice, roughness: 0.3, metalness: 0.15 }));
	kit.piece(new THREE.CircleGeometry(ICE, 64), ice, 0, iceY, 0, -Math.PI / 2);

	// Boards: a ring with a two-panel gap facing the square. Angles run clockwise from local −z.
	const boards = kit.face(rinkBoards(), { roughness: 0.8 });
	const step = (Math.PI * 2) / SEGMENTS;
	const width = 2 * BOARDS * Math.sin(step / 2);
	for (let i = 1; i < SEGMENTS - 1; i++) {
		const a0 = i * step;
		const a1 = a0 + step;
		const mid = (a0 + a1) / 2;
		const x = Math.sin(mid) * BOARDS;
		const z = -Math.cos(mid) * BOARDS;
		kit.box(width + 0.02, 0.8, 0.07, boards, x, iceY + 0.38, z, -mid);
		kit.wall(Math.sin(a0) * BOARDS, -Math.cos(a0) * BOARDS, Math.sin(a1) * BOARDS, -Math.cos(a1) * BOARDS, 0.1);
	}

	const netting = kit.face(netMesh(RINK.mesh), { transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 });
	const frame = kit.solid(RINK.post, 0.45, 0.3);
	const size = { w: 1.83, h: 1.22, d: 0.9, bar: 0.035 };
	goal(kit, frame, netting, 0, -4.1, Math.PI, iceY, size);
	goal(kit, frame, netting, 0, 4.1, 0, iceY, size);
	const puck = kit.solid(RINK.puck, 0.6);
	for (let i = 0; i < 4; i++) {
		const r = rand() * 4.5;
		const a = rand() * Math.PI * 2;
		kit.cyl(0.05, 0.05, 0.03, puck, Math.cos(a) * r, iceY + 0.015, Math.sin(a) * r, 14);
	}

	// A stick against the boards by the gap, its blade taped.
	const stick = kit.solid(RINK.stick, 0.6);
	const tape = kit.solid(RINK.tape, 0.9);
	kit.box(0.03, 1.45, 0.022, stick, 1.55, iceY + 0.7, -6.05, 0.3, 0, 0.16);
	kit.box(0.3, 0.075, 0.014, tape, 1.72, iceY + 0.05, -6.1, 0.3);

	// String lights on log posts, and the warm light they throw on the ice.
	const log = kit.solid(WOOD.log, 0.9);
	const posts = Array.from({ length: LIGHT_POSTS }, (_, i) => {
		const a = Math.PI / LIGHT_POSTS + (i / LIGHT_POSTS) * Math.PI * 2;
		const x = Math.sin(a) * 8.4;
		const z = -Math.cos(a) * 8.4;
		const y0 = kit.ground(x, z);
		kit.cyl(0.07, 0.09, 3.3, log, x, y0 + 1.65, z, 7);
		kit.pillar(x, z, 0.2);
		return { x, z, y: y0 + 3.2 };
	});
	stringLights(kit, posts);
	const glow = new THREE.PointLight(RINK.bulb, 6, 18, 1.8);
	kit.add(glow, 0, 3.4, 0);

	// A log bench outside the gap, and the sign.
	const benchY = kit.ground(-2.6, -8.2);
	kit.cyl(0.24, 0.24, 2.0, log, -2.6, benchY + 0.24, -8.2, 8, 0, Math.PI / 2);
	kit.wall(-3.6, -8.2, -1.6, -8.2, 0.3);
	const sign = paintedBoard(['STILLWATER POND RINK', 'POND HOCKEY · NO ZAMBONI'], { ground: RINK.boards, ink: RINK.tape, border: RINK.post, w: 512, h: 170 });
	kit.sign(sign, 2.6, -8.3, { w: 1.7, h: 0.56, tidbit: 'pond-rink' });

	// The lost puck: frozen into a drift well past the far net, glinting now and then.
	const lost = { x: 1.6, z: 10.4 };
	const lostY = kit.ground(lost.x, lost.z);
	kit.piece(new THREE.SphereGeometry(0.55, 12, 8), kit.solid(NIGHT.snow, 0.9), lost.x, lostY - 0.28, lost.z);
	// Half buried in the drift's flank, tipped with its slope.
	kit.cyl(0.05, 0.05, 0.03, puck, lost.x - 0.33, lostY + 0.13, lost.z, 14, 0, 0.65);
	const glint = new THREE.Sprite(
		kit.keep(new THREE.SpriteMaterial({ map: kit.keep(softDot(32, 0.1)), color: NIGHT.snow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))
	);
	glint.scale.setScalar(0.35);
	kit.add(glint, lost.x - 0.36, lostY + 0.2, lost.z);
	kit.tidbit('lost-puck', lost.x, lost.z, lostY + 0.2, 1.9);

	kit.onUpdate((t) => {
		const phase = (t % 4.3) / 4.3;
		glint.material.opacity = phase < 0.12 ? Math.sin((phase / 0.12) * Math.PI) * 0.9 : 0;
		glow.intensity = 6 + Math.sin(t * 1.7) * 0.3;
	});
	return kit.build();
}
