// Seeded randomness and noise, so the same registry always grows the same forest and mountains.

import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

/** mulberry32: a tiny, fast, seedable PRNG returning floats in [0, 1). */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function seedFrom(text: string): number {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
	return h >>> 0;
}

export interface Noise2 {
	/** Simplex noise in [-1, 1]. */
	at(x: number, y: number): number;
	/** Fractal sum of `octaves` layers, normalised to about [-1, 1]. */
	fbm(x: number, y: number, octaves?: number): number;
	/** Ridged fractal noise in [0, 1]: sharp crests, the shape of mountain ranges. */
	ridged(x: number, y: number, octaves?: number): number;
}

export function noise2(seed: number): Noise2 {
	const simplex = new SimplexNoise({ random: rng(seed) });
	const at = (x: number, y: number) => simplex.noise(x, y);
	return {
		at,
		fbm(x, y, octaves = 4) {
			let sum = 0;
			let amp = 1;
			let freq = 1;
			let norm = 0;
			for (let i = 0; i < octaves; i++) {
				sum += amp * at(x * freq, y * freq);
				norm += amp;
				amp *= 0.5;
				freq *= 2.03;
			}
			return sum / norm;
		},
		ridged(x, y, octaves = 5) {
			let sum = 0;
			let amp = 0.5;
			let freq = 1;
			let prev = 1;
			let norm = 0;
			for (let i = 0; i < octaves; i++) {
				const n = 1 - Math.abs(at(x * freq, y * freq));
				const v = n * n * prev;
				sum += v * amp;
				norm += amp;
				prev = n;
				amp *= 0.5;
				freq *= 2.1;
			}
			return sum / norm;
		}
	};
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
	return t * t * (3 - 2 * t);
}
