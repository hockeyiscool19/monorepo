// GPU particle systems: every particle's motion is a function of time in the vertex shader, so the CPU only
// advances one uniform per frame. Fire and embers for braziers, snowfall around the player, dust motes in
// the Get-a-way's sunbeam, chimney smoke.

import * as THREE from 'three';
import { rng } from './noise';

export interface Particles {
	points: THREE.Points;
	update(t: number, center?: THREE.Vector3): void;
	dispose(): void;
}

function seeds(count: number, seed: number, per: number): Float32Array {
	const rand = rng(seed);
	const out = new Float32Array(count * per);
	for (let i = 0; i < out.length; i++) out[i] = rand();
	return out;
}

function points(count: number, seed: number, material: THREE.ShaderMaterial, radius: number): Particles {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
	geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds(count, seed, 4), 4));
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
	const pts = new THREE.Points(geometry, material);
	pts.frustumCulled = true;
	return {
		points: pts,
		update(t, center) {
			material.uniforms.uTime.value = t;
			if (center && material.uniforms.uCenter) material.uniforms.uCenter.value.copy(center);
		},
		dispose() {
			geometry.dispose();
			material.dispose();
		}
	};
}

const HEAD = /* glsl */ `
uniform float uTime; uniform float uScale;
attribute vec4 aSeed;
varying float vLife; varying float vSeed;
`;

/** Flames rising from a bowl: yellow core → orange → red embers, additive. */
export function fire(opts: { count?: number; seed?: number; radius?: number; height?: number; size?: number; core: THREE.Color; flame: THREE.Color; ember: THREE.Color; pixelRatio: number }): Particles {
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uScale: { value: (opts.size ?? 90) * opts.pixelRatio },
			uRadius: { value: opts.radius ?? 0.35 },
			uHeight: { value: opts.height ?? 1.3 },
			uCore: { value: opts.core },
			uFlame: { value: opts.flame },
			uEmber: { value: opts.ember }
		},
		vertexShader: /* glsl */ `${HEAD}
			uniform float uRadius; uniform float uHeight;
			void main() {
				float speed = 0.7 + aSeed.w * 0.8;
				float life = fract(uTime * speed * 0.9 + aSeed.x);
				vLife = life; vSeed = aSeed.y;
				float ang = aSeed.y * 6.2831853;
				float rad = uRadius * sqrt(aSeed.z) * (1.0 - life * 0.8);
				vec3 p = vec3(cos(ang) * rad, life * uHeight * (0.6 + aSeed.w * 0.6), sin(ang) * rad);
				p.x += sin(uTime * 3.0 + aSeed.x * 20.0) * 0.06 * life;
				vec4 mv = modelViewMatrix * vec4(p, 1.0);
				gl_PointSize = uScale * (1.0 - life * 0.7) * (0.5 + aSeed.z * 0.6) / -mv.z;
				gl_Position = projectionMatrix * mv;
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 uCore; uniform vec3 uFlame; uniform vec3 uEmber;
			varying float vLife; varying float vSeed;
			void main() {
				float d = length(gl_PointCoord - 0.5);
				if (d > 0.5) discard;
				float soft = 1.0 - smoothstep(0.0, 0.5, d);
				vec3 col = mix(uCore, uFlame, smoothstep(0.0, 0.35, vLife));
				col = mix(col, uEmber, smoothstep(0.35, 0.9, vLife));
				gl_FragColor = vec4(col * 2.2, soft * (1.0 - vLife));
			}`,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending
	});
	return points(opts.count ?? 60, opts.seed ?? 1, material, 2);
}

/** Snow falling in a box that follows the player (uCenter), drifting with the wind. */
export function snowfall(opts: { count: number; size?: number; color: THREE.Color; pixelRatio: number; box?: [number, number, number] }): Particles {
	const box = opts.box ?? [70, 36, 70];
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uScale: { value: (opts.size ?? 26) * opts.pixelRatio },
			uCenter: { value: new THREE.Vector3() },
			uBox: { value: new THREE.Vector3(...box) },
			uColor: { value: opts.color }
		},
		vertexShader: /* glsl */ `${HEAD}
			uniform vec3 uCenter; uniform vec3 uBox;
			void main() {
				vLife = aSeed.w; vSeed = aSeed.x;
				float fall = uTime * (0.9 + aSeed.w * 0.9);
				vec3 p = vec3(aSeed.x, 1.0 - fract(aSeed.y + fall / uBox.y), aSeed.z) * uBox;
				p.x += uTime * 0.9 + sin(uTime * 0.8 + aSeed.x * 30.0) * 0.6;
				p.z += sin(uTime * 0.6 + aSeed.z * 30.0) * 0.5;
				// Wrap around the player so the box never runs out.
				vec3 origin = uCenter - uBox * 0.5;
				p.xz = mod(p.xz - origin.xz, uBox.xz) + origin.xz;
				p.y += uCenter.y - uBox.y * 0.35;
				vec4 mv = viewMatrix * vec4(p, 1.0);
				gl_PointSize = uScale * (0.4 + aSeed.w * 0.7) / -mv.z;
				gl_Position = projectionMatrix * mv;
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor; varying float vLife;
			void main() {
				float d = length(gl_PointCoord - 0.5);
				if (d > 0.5) discard;
				gl_FragColor = vec4(uColor, (1.0 - smoothstep(0.1, 0.5, d)) * (0.45 + vLife * 0.45));
			}`,
		transparent: true,
		depthWrite: false
	});
	const p = points(opts.count, 77, material, 1e6);
	p.points.frustumCulled = false;
	return p;
}

/** Dust motes turning slowly in a sunbeam (a box, local to the parent). */
export function motes(opts: { count: number; box: [number, number, number]; color: THREE.Color; pixelRatio: number }): Particles {
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uScale: { value: 14 * opts.pixelRatio },
			uBox: { value: new THREE.Vector3(...opts.box) },
			uColor: { value: opts.color }
		},
		vertexShader: /* glsl */ `${HEAD}
			uniform vec3 uBox;
			void main() {
				vLife = aSeed.w; vSeed = aSeed.x;
				vec3 p = (aSeed.xyz - 0.5) * uBox;
				p.x += sin(uTime * 0.13 + aSeed.w * 40.0) * 0.25;
				p.y += sin(uTime * 0.09 + aSeed.x * 40.0) * 0.18;
				p.z += cos(uTime * 0.11 + aSeed.y * 40.0) * 0.25;
				vec4 mv = modelViewMatrix * vec4(p, 1.0);
				gl_PointSize = uScale * (0.4 + aSeed.w) / -mv.z;
				gl_Position = projectionMatrix * mv;
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor; uniform float uTime; varying float vLife; varying float vSeed;
			void main() {
				float d = length(gl_PointCoord - 0.5);
				if (d > 0.5) discard;
				float twinkle = 0.5 + 0.5 * sin(uTime * (0.6 + vSeed) + vLife * 30.0);
				gl_FragColor = vec4(uColor * 1.6, (1.0 - smoothstep(0.0, 0.5, d)) * (0.25 + 0.5 * twinkle));
			}`,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending
	});
	return points(opts.count, 5, material, Math.max(...opts.box));
}

/** Soft smoke puffs rising and spreading from a chimney or a campfire. */
export function smoke(opts: { count?: number; height?: number; drift?: number; spread?: number; color: THREE.Color; pixelRatio: number; map: THREE.Texture }): Particles {
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uScale: { value: 900 * opts.pixelRatio },
			uHeight: { value: opts.height ?? 7 },
			uDrift: { value: opts.drift ?? 1.8 },
			uSpread: { value: opts.spread ?? 0.4 },
			uColor: { value: opts.color },
			uMap: { value: opts.map }
		},
		vertexShader: /* glsl */ `${HEAD}
			uniform float uHeight; uniform float uDrift; uniform float uSpread;
			void main() {
				float life = fract(uTime * (0.05 + aSeed.w * 0.04) + aSeed.x);
				vLife = life; vSeed = aSeed.y;
				vec3 p = vec3((aSeed.y - 0.5) * uSpread + life * uDrift, life * uHeight, (aSeed.z - 0.5) * uSpread + life * uDrift * 0.33);
				vec4 mv = modelViewMatrix * vec4(p, 1.0);
				gl_PointSize = uScale * (0.2 + life * 0.9) / -mv.z;
				gl_Position = projectionMatrix * mv;
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor; uniform sampler2D uMap; varying float vLife;
			void main() {
				float a = texture2D(uMap, gl_PointCoord).a;
				gl_FragColor = vec4(uColor, a * 0.32 * smoothstep(0.0, 0.15, vLife) * (1.0 - vLife));
			}`,
		transparent: true,
		depthWrite: false
	});
	return points(opts.count ?? 24, 11, material, 12);
}
