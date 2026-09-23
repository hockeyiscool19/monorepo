// The overworld space: the valley of Eisenhold under the aurora, with one gate per app in the registry,
// the square, the cabin, the guard, the dragon and falling snow. Assembled here, drawn by the engine.

import * as THREE from 'three';
import type { Capsule } from '../../domain/collide';
import { inFrontOf, type RealmData, type RealmLayout } from '../../domain/realm';
import { gatePlaceName, PLACE_NAMES } from '../../domain/lore';
import { NIGHT } from '../palette';
import { snowfall } from '../particles';
import type { BuildContext, GateLook, Interactable, Marker, Space, Trigger } from '../space';
import { buildCabin } from './cabin';
import { buildDragon, buildGuard } from './creatures';
import { buildFlora } from './flora';
import { buildGate, type GateObject } from './gate';
import { buildHub } from './hub';
import { buildSky } from './sky';
import { buildTerrain } from './terrain';

export function buildOverworld(realm: RealmData, layout: RealmLayout, ctx: BuildContext): Space {
	const scene = new THREE.Scene();
	scene.name = 'overworld';
	scene.fog = new THREE.FogExp2(NIGHT.fog, 0.0105);

	const terrain = buildTerrain(layout, ctx.quality);
	scene.add(terrain.mesh);
	const sky = buildSky();
	scene.add(sky.mesh);

	scene.add(new THREE.HemisphereLight(NIGHT.hemiSky, NIGHT.hemiGround, 0.62));
	const moon = new THREE.DirectionalLight(NIGHT.moonlight, 1.25);
	const shadows = ctx.quality !== 'low';
	if (shadows) {
		moon.castShadow = true;
		const size = ctx.quality === 'high' ? 2048 : 1024;
		moon.shadow.mapSize.set(size, size);
		const cam = moon.shadow.camera;
		cam.left = -42;
		cam.right = 42;
		cam.top = 42;
		cam.bottom = -42;
		cam.near = 1;
		cam.far = 260;
		moon.shadow.bias = -0.0008;
		moon.shadow.normalBias = 0.04;
	}
	scene.add(moon, moon.target);

	const flora = buildFlora(layout, terrain.heightAt, terrain.paths, ctx.quality);
	scene.add(flora.group);
	const hub = buildHub(layout, realm.gates, terrain.heightAt, ctx.pixelRatio);
	scene.add(hub.group);
	const gates = new Map<string, GateObject>();
	for (const placed of layout.gates) {
		const gate = buildGate(placed, terrain.heightAt(placed.spot.x, placed.spot.z), ctx.pixelRatio, ctx.quality);
		gates.set(placed.gate.id, gate);
		scene.add(gate.group);
	}
	const cabin = buildCabin(layout.cabin, terrain.heightAt(layout.cabin.x, layout.cabin.z), ctx.pixelRatio);
	scene.add(cabin.group);
	const guard = buildGuard(layout.guard, terrain.heightAt(layout.guard.x, layout.guard.z));
	scene.add(guard.group);
	const dragon = buildDragon();
	scene.add(dragon.group);
	const snow = snowfall({
		count: ctx.quality === 'low' ? 1400 : ctx.quality === 'medium' ? 3200 : 5600,
		color: new THREE.Color(NIGHT.snow),
		pixelRatio: ctx.pixelRatio
	});
	scene.add(snow.points);

	const colliders: Capsule[] = [...hub.colliders, ...flora.colliders, ...cabin.colliders, guard.collider];
	const interactables: Interactable[] = [...hub.interactables, cabin.interactable, guard.interactable];
	const triggers: Trigger[] = [];
	for (const gate of gates.values()) {
		colliders.push(...gate.colliders);
		interactables.push(gate.interactable);
		triggers.push(gate.trigger);
	}

	const markers: Marker[] = [
		...layout.gates.map((g) => ({ id: `gate:${g.gate.id}`, x: g.spot.x, z: g.spot.z, icon: g.gate.icon || '✦', label: gatePlaceName(g.gate.name) })),
		{ id: 'cabin-door', x: layout.cabin.x, z: layout.cabin.z, icon: '🏠', label: PLACE_NAMES.cabin },
		{ id: 'word-wall', x: layout.wordWall.x, z: layout.wordWall.z, icon: '📜', label: PLACE_NAMES.wordWall },
		{ id: 'campfire', x: layout.campfire.x, z: layout.campfire.z, icon: '🔥', label: PLACE_NAMES.campfire }
	];

	const spawns: Record<string, { x: number; z: number; yaw: number }> = {
		start: layout.spawn,
		cabin: cabin.doorstep,
		'word-wall': inFrontOf(layout.wordWall, 3.4),
		campfire: inFrontOf(layout.campfire, 3)
	};
	for (const g of layout.gates) spawns[`gate:${g.gate.id}`] = inFrontOf(g.spot, 8);

	// Every ward starts closed (fail closed): only the UI's decision opens a gate.
	const disabled = new Set<string>();
	const fires = [...hub.fires, ...[...gates.values()].flatMap((g) => g.fires)];

	return {
		id: 'overworld',
		scene,
		fov: 70,
		far: 2000,
		spawns,
		eyeHeight: 1.72,
		walkSpeed: 4.4,
		runSpeed: 8.4,
		colliders,
		disabled,
		boundary: { radius: layout.boundary },
		heightAt: terrain.heightAt,
		interactables,
		triggers,
		markers,
		grade: {
			grain: 0.035,
			vignette: 0.42,
			leak: 0,
			aberration: 0.0008,
			saturation: 0.94,
			tint: [0.96, 1.0, 1.06],
			lift: [0, 0.008, 0.022],
			weave: 0
		},
		bloom: { strength: 0.8, radius: 0.55, threshold: 0.7 },
		ambience: 'wind',
		sounds: [
			...fires.map((f, i) => ({ kind: 'fire' as const, x: f.x, z: f.z, key: `fire:${i}` })),
			...layout.gates.map((g) => ({ kind: 'portal' as const, x: g.spot.x, z: g.spot.z, key: `portal:${g.gate.id}` }))
		],
		update(frame) {
			const { t, dt, player, camera, reducedMotion } = frame;
			sky.update(t, camera, reducedMotion ? 0 : 1);
			// Keep the shadow frustum centred on the player so nearby shadows stay crisp.
			moon.position.set(player.x + sky.moonDirection.x * 120, sky.moonDirection.y * 120, player.z + sky.moonDirection.z * 120);
			moon.target.position.set(player.x, 0, player.z);
			hub.update(t, player);
			for (const gate of gates.values()) gate.update(t, dt);
			cabin.update(t);
			guard.update(t, player);
			dragon.update(t);
			snow.update(reducedMotion ? 0 : t, camera.position);
		},
		setGateLook(id: string, look: GateLook) {
			const gate = gates.get(id);
			if (!gate) return;
			gate.setLook(look);
			if (look === 'open' || look === 'unstable') disabled.add(gate.wardTag);
			else disabled.delete(gate.wardTag);
		},
		dispose() {
			terrain.dispose();
			sky.dispose();
			flora.dispose();
			hub.dispose();
			for (const gate of gates.values()) gate.dispose();
			cabin.dispose();
			guard.dispose();
			dragon.dispose();
			snow.dispose();
		}
	};
}
