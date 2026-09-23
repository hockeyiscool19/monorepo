// The My Get-a-way space: the room, Colorado outside, a late-afternoon sun pouring through the window,
// and the heaviest film grade in Eisenhold — grain, warmth, halation, a light leak — so it feels remembered.

import * as THREE from 'three';
import type { Card } from '../../domain/board';
import { COLORADO, GETAWAY } from '../palette';
import { motes, type Particles } from '../particles';
import type { BuildContext, Space } from '../space';
import { buildColorado } from './colorado';
import { buildRoom, ROOM, WINDOW } from './room';

export function buildGetaway(ctx: BuildContext): Space {
	const scene = new THREE.Scene();
	scene.name = 'getaway';
	scene.fog = new THREE.FogExp2(COLORADO.skyHorizon, 0.0009);
	const shadows = ctx.quality !== 'low';

	const colorado = buildColorado(ctx.quality);
	scene.add(colorado.group);
	const room = buildRoom(ctx.pixelRatio, shadows);
	scene.add(room.group);

	scene.add(new THREE.HemisphereLight(GETAWAY.lamp, GETAWAY.floorDark, 0.55));
	const sun = new THREE.DirectionalLight(GETAWAY.sun, 3.4);
	sun.position.copy(colorado.sunDirection).multiplyScalar(40);
	sun.target.position.set(0, 0, 0);
	if (shadows) {
		sun.castShadow = true;
		sun.shadow.mapSize.set(ctx.quality === 'high' ? 2048 : 1024, ctx.quality === 'high' ? 2048 : 1024);
		const cam = sun.shadow.camera;
		cam.left = -6;
		cam.right = 6;
		cam.top = 6;
		cam.bottom = -6;
		cam.near = 10;
		cam.far = 80;
		sun.shadow.bias = -0.0006;
		sun.shadow.normalBias = 0.02;
	}
	// The shadow camera only covers the room, so the valley beyond stays in full sun.
	scene.add(sun, sun.target);

	// Dust turning in the sunbeam that falls through the window.
	const dust: Particles = motes({ count: ctx.quality === 'low' ? 60 : 140, box: [WINDOW.w, 1.8, 2.6], color: new THREE.Color(GETAWAY.sun), pixelRatio: ctx.pixelRatio });
	dust.points.position.set(-0.4, 1.3, -1.1);
	scene.add(dust.points);

	return {
		id: 'getaway',
		scene,
		fov: 70,
		far: 1600,
		spawns: {
			door: { x: 1.4, z: 1.55, yaw: 0.35 },
			board: { x: 1.0, z: -0.85, yaw: -Math.PI / 2 + 0.25 },
			cork: { x: -1.9, z: 0, yaw: Math.PI / 2 }
		},
		eyeHeight: 1.62,
		walkSpeed: 2.2,
		runSpeed: 3.4,
		colliders: room.colliders,
		disabled: new Set<string>(),
		heightAt: () => 0,
		interactables: room.interactables,
		triggers: [],
		markers: [
			{ id: 'getaway:drawing-board', x: 1.75, z: -1.15, icon: '📐', label: 'Drawing board' },
			{ id: 'getaway:cork-board', x: -ROOM.w / 2, z: 0, icon: '📌', label: 'Cork board' },
			{ id: 'getaway:window', x: 0, z: -40, icon: '🏔️', label: 'Colorado' },
			{ id: 'getaway:exit', x: 1.6, z: ROOM.d / 2, icon: '🚪', label: 'Door to Eisenhold' }
		],
		grade: {
			grain: 0.11,
			vignette: 0.62,
			leak: 0.32,
			aberration: 0.0022,
			saturation: 0.86,
			tint: [1.06, 1.0, 0.9],
			lift: [0.055, 0.035, 0.012],
			weave: ctx.reducedMotion ? 0 : 0.0012
		},
		bloom: { strength: 0.5, radius: 0.75, threshold: 0.8 },
		ambience: 'cabin',
		sounds: [{ kind: 'fire', x: 2.45, z: -1.95, key: 'stove' }],
		update(frame) {
			colorado.update(frame.t);
			room.update(frame.t);
			dust.update(frame.reducedMotion ? 0 : frame.t);
		},
		setBoard(cards: Card[]) {
			room.boards.setCards(cards);
		},
		dispose() {
			dust.dispose();
			room.dispose();
			colorado.dispose();
		}
	};
}
