// GLSL for the effects three.js has no material for: the portal vortex, the sealing ward, the aurora sky,
// fluttering cloth and the film-grade pass (grain, vignette, warmth, light leak) used by both spaces.

const NOISE = /* glsl */ `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; } return s; }
// 1 at or below lo, 0 at or above hi (smoothstep with reversed edges is undefined in GLSL).
float fall(float lo, float hi, float x) { return 1.0 - smoothstep(lo, hi, x); }
`;

export const uvVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/** The swirling portal inside a gate: an arch-shaped vortex in the gate's colours. uState: 1 open, 0.35 unstable. */
export const portalFragment = /* glsl */ `
${NOISE}
uniform float uTime; uniform vec3 uColorA; uniform vec3 uColorB; uniform float uState; uniform float uAspect;
varying vec2 vUv;
void main() {
	vec2 p = vUv * 2.0 - 1.0;
	p.x *= uAspect;
	// Arch mask: straight sides, round top.
	float w = uAspect;
	float top = 1.0 - w;
	float inside = p.y < top ? step(abs(p.x), w * 0.98) : step(length(vec2(p.x, p.y - top)), w * 0.98);
	float edge = p.y < top ? fall(w * 0.8, w, abs(p.x)) : fall(w * 0.8, w, length(vec2(p.x, p.y - top)));
	vec2 c = vec2(p.x, p.y - top * 0.4);
	float r = length(c);
	float a = atan(c.y, c.x);
	float swirl = fbm(vec2(a * 1.6 + r * 3.0 - uTime * 0.9, r * 2.2 - uTime * 0.45));
	float rings = 0.5 + 0.5 * sin(r * 14.0 - uTime * 3.0 + swirl * 6.0);
	vec3 col = mix(uColorA, uColorB, swirl);
	col += vec3(1.0) * pow(max(0.0, 1.0 - r * 1.5), 3.0) * 0.55;
	col *= 0.75 + rings * 0.6;
	float flicker = uState < 0.99 ? 0.55 + 0.45 * step(0.35, vnoise(vec2(uTime * 7.0, 1.3))) : 1.0;
	float alpha = inside * edge * (0.62 + 0.38 * swirl) * uState * flicker;
	gl_FragColor = vec4(col * (0.85 * uState), alpha);
}
`;

/** A sealing ward: a hexagonal rune lattice that pulses. uColor carries the meaning (sealed red, open gold). */
export const wardFragment = /* glsl */ `
${NOISE}
uniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform float uAspect;
varying vec2 vUv;
float hexDist(vec2 p) { p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
void main() {
	vec2 p = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0) * 3.2;
	vec2 r = vec2(1.0, 1.7320508);
	vec2 h = r * 0.5;
	vec2 a = mod(p, r) - h;
	vec2 b = mod(p - h, r) - h;
	vec2 g = dot(a, a) < dot(b, b) ? a : b;
	float edge = smoothstep(0.44, 0.5, hexDist(g));
	float pulse = 0.55 + 0.45 * sin(uTime * 2.2 + fbm(p * 0.6 + uTime * 0.2) * 6.0);
	vec2 q = vUv * 2.0 - 1.0;
	float vign = fall(0.55, 1.15, length(q * vec2(0.9, 1.0)));
	float sigil = fall(0.0, 0.03, abs(length(q * vec2(uAspect, 1.0)) - 0.42)) + fall(0.0, 0.02, abs(q.x * uAspect)) * step(abs(q.y), 0.42);
	float alpha = (edge * pulse * 0.8 + sigil * 0.9 + 0.08) * vign * uOpacity;
	gl_FragColor = vec4(uColor * (1.2 + pulse), alpha);
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = normalize(position);
	vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	gl_Position = pos.xyww;
}
`;

/** Night sky: gradient, stars, two moons and aurora curtains in the north. */
export const skyFragment = /* glsl */ `
${NOISE}
uniform float uTime; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
uniform vec3 uAuroraA; uniform vec3 uAuroraB; uniform vec3 uAuroraC; uniform vec3 uMasser; uniform vec3 uSecunda;
uniform vec3 uMasserDir; uniform vec3 uSecundaDir; uniform float uMotion;
varying vec3 vDir;
void main() {
	vec3 d = normalize(vDir);
	float h = d.y;
	vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
	col = mix(uGround, col, smoothstep(-0.12, 0.0, h));
	// Stars: a hashed grid on the sphere, twinkling.
	vec2 sp = vec2(atan(d.z, d.x) * 60.0, asin(clamp(d.y, -1.0, 1.0)) * 60.0);
	vec2 cell = floor(sp);
	float star = step(0.985, hash21(cell));
	float tw = 0.6 + 0.4 * sin(uTime * uMotion * (1.0 + hash21(cell + 3.1) * 3.0) + hash21(cell) * 40.0);
	float dotMask = fall(0.0, 0.35, length(fract(sp) - 0.5));
	col += vec3(0.9, 0.95, 1.0) * star * dotMask * tw * smoothstep(0.02, 0.25, h) * 1.4;
	// Aurora: curtains over the northern half (−z), rippling slowly.
	float north = fall(-0.7, 0.1, d.z);
	float az = atan(d.x, -d.z);
	float t = uTime * 0.05 * uMotion;
	float band = fbm(vec2(az * 2.4 + t, t * 0.7));
	float curtain = fall(0.0, 0.08, abs(h - (0.22 + band * 0.28)));
	float rays = 0.55 + 0.45 * sin(az * 90.0 + fbm(vec2(az * 8.0, t * 3.0)) * 12.0);
	float hBand = smoothstep(0.05, 0.25, h) * fall(0.35, 0.85, h);
	float aur = (curtain * 0.8 + band * 0.35) * rays * hBand * north;
	vec3 aurCol = mix(uAuroraA, uAuroraB, smoothstep(0.15, 0.45, h));
	aurCol = mix(aurCol, uAuroraC, smoothstep(0.4, 0.7, h + band * 0.2));
	col += aurCol * aur * 1.25;
	// Moons.
	float m1 = dot(d, normalize(uMasserDir));
	float m2 = dot(d, normalize(uSecundaDir));
	float disc1 = smoothstep(0.99955, 0.9997, m1);
	float disc2 = smoothstep(0.99985, 0.99992, m2);
	float crater = 0.85 + 0.15 * fbm(d.xy * 90.0);
	col = mix(col, uMasser * crater * 1.25, disc1);
	col = mix(col, uSecunda * 1.3, disc2);
	col += uMasser * pow(max(0.0, m1), 900.0) * 0.35 + uSecunda * pow(max(0.0, m2), 2400.0) * 0.4;
	gl_FragColor = vec4(col, 1.0);
}
`;

/** Cloth that ripples in the wind (banners, the Colorado pennant). Pinned along its top edge. */
export const clothVertex = /* glsl */ `
uniform float uTime; uniform float uWind;
varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main() {
	vUv = uv;
	vec3 p = position;
	float free = 1.0 - uv.y;
	p.z += sin(uv.y * 5.0 + uTime * 2.3 + position.x * 1.7) * 0.12 * free * uWind;
	p.x += sin(uv.y * 3.0 + uTime * 1.7) * 0.04 * free * uWind;
	vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
	gl_Position = projectionMatrix * mvPosition;
	#include <fog_vertex>
}
`;

export const clothFragment = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uTint;
varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
void main() {
	vec4 tex = texture2D(uMap, vUv);
	if (tex.a < 0.5) discard;
	gl_FragColor = vec4(tex.rgb * uTint, 1.0);
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;

/**
 * Film grade, after tone mapping (display-referred): chromatic fringe, colour grade, light leak, vignette and
 * animated grain. The Get-a-way turns every knob up; the overworld keeps it subtle and cold.
 */
export const gradeFragment = /* glsl */ `
uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVignette; uniform float uLeak;
uniform float uAberration; uniform float uSaturation; uniform vec3 uTint; uniform vec3 uLift; uniform float uWeave;
varying vec2 vUv;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
	vec2 uv = vUv + vec2(0.0, (h12(vec2(floor(uTime * 12.0), 7.0)) - 0.5) * uWeave);
	vec2 dir = uv - 0.5;
	vec3 col;
	col.r = texture2D(tDiffuse, uv + dir * uAberration).r;
	col.g = texture2D(tDiffuse, uv).g;
	col.b = texture2D(tDiffuse, uv - dir * uAberration).b;
	float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
	col = mix(vec3(lum), col, uSaturation);
	col = col * uTint + uLift * (1.0 - col);
	float leak = (1.0 - smoothstep(0.0, 0.75, distance(uv, vec2(-0.08, 0.92)))) * uLeak * (0.8 + 0.2 * sin(uTime * 0.35));
	col += vec3(1.0, 0.48, 0.18) * leak;
	col *= mix(1.0, 1.0 - smoothstep(0.28, 0.95, length(dir * vec2(1.1, 1.0))), uVignette);
	float g = h12(uv * vec2(1733.0, 977.0) + fract(uTime * 23.17) * 311.0) - 0.5;
	col += g * uGrain * (1.0 - lum * 0.5);
	gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
