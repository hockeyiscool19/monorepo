// The traveller: a first-person walker with collisions against the space's capsules, feet on its ground,
// a stamina bar for running, a small hop, and a gentle head bob (off under reduced motion).

import type * as THREE from 'three';
import { crosses, resolve } from '../domain/collide';
import type { Spot } from '../domain/realm';
import type { InputState } from './input';
import type { Space } from './space';

export interface Look {
	sensitivity: number;
	invertY: boolean;
}

const RADIUS = 0.38;
const GRAVITY = 18;
const JUMP = 5.2;

export class Player {
	x = 0;
	z = 0;
	/** Feet height. */
	y = 0;
	yaw = 0;
	pitch = 0;
	stamina = 1;
	private vx = 0;
	private vz = 0;
	private vy = 0;
	private grounded = true;
	private bob = 0;

	place(spot: Spot, space: Space): void {
		this.x = spot.x;
		this.z = spot.z;
		this.yaw = spot.yaw;
		this.pitch = space.id === 'getaway' ? -0.06 : 0.02;
		this.y = space.heightAt(spot.x, spot.z);
		this.vx = this.vz = this.vy = 0;
	}

	/**
	 * Advance one frame. Returns the ids of any portal triggers crossed on the way, so the engine can fire
	 * them. Walls, pillars and closed wards stop the step before it happens.
	 */
	step(dt: number, input: InputState, lookDelta: { x: number; y: number }, jump: boolean, space: Space, look: Look): string[] {
		const sens = 0.0022 * look.sensitivity;
		this.yaw -= lookDelta.x * sens;
		this.pitch -= lookDelta.y * sens * (look.invertY ? -1 : 1);
		this.yaw += input.turn * 1.9 * dt;
		this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));

		const running = input.sprint && this.stamina > 0.02 && (input.move.x !== 0 || input.move.y !== 0);
		const speed = running ? space.runSpeed : space.walkSpeed;
		const fx = -Math.sin(this.yaw);
		const fz = -Math.cos(this.yaw);
		const rx = Math.cos(this.yaw);
		const rz = -Math.sin(this.yaw);
		const tx = (fx * input.move.y + rx * input.move.x) * speed;
		const tz = (fz * input.move.y + rz * input.move.x) * speed;
		const accel = Math.min(1, dt * (this.grounded ? 12 : 3));
		this.vx += (tx - this.vx) * accel;
		this.vz += (tz - this.vz) * accel;
		this.stamina = Math.max(0, Math.min(1, this.stamina + (running ? -0.22 : 0.14) * dt));

		const x0 = this.x;
		const z0 = this.z;
		// Sub-steps keep fast movement from tunnelling through thin walls.
		const steps = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vz) * dt) / 0.2));
		for (let i = 0; i < steps; i++) {
			const [nx, nz] = resolve(this.x + (this.vx * dt) / steps, this.z + (this.vz * dt) / steps, RADIUS, space.colliders, space.boundary, space.disabled);
			this.x = nx;
			this.z = nz;
		}

		const ground = space.heightAt(this.x, this.z);
		if (jump && this.grounded) {
			this.vy = JUMP;
			this.grounded = false;
		}
		this.vy -= GRAVITY * dt;
		this.y += this.vy * dt;
		if (this.y <= ground) {
			this.y = ground;
			this.vy = 0;
			this.grounded = true;
		}
		const moving = Math.hypot(this.vx, this.vz);
		this.bob += moving * dt * (running ? 1.9 : 2.3);

		const crossed: string[] = [];
		for (const trigger of space.triggers) {
			if (crosses(trigger.capsule, x0, z0, this.x, this.z)) crossed.push(trigger.id);
		}
		return crossed;
	}

	/** Place the camera at the eyes; `bobAmount` 0 under reduced motion. */
	applyTo(camera: THREE.PerspectiveCamera, eyeHeight: number, bobAmount: number): void {
		const bob = Math.sin(this.bob * 2) * 0.035 * bobAmount;
		camera.position.set(this.x, this.y + eyeHeight + bob, this.z);
		camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
	}

	/** Unit vector the player looks along, on the ground plane. */
	facing(): { x: number; z: number } {
		return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
	}
}
