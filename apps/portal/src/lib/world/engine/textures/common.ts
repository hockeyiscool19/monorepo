// Shared helpers for procedural canvas textures: canvases, fonts, noise speckle and soft sprites.
// Everything in Eisenhold is painted at load time — no image files to fetch, nothing to license.

import * as THREE from 'three';

export const FONT_DISPLAY = '"Cinzel", "Trajan Pro", "Times New Roman", Georgia, serif';
export const FONT_SANS = '"Jost", "Futura", "Century Gothic", system-ui, sans-serif';
export const FONT_HAND = '"Caveat", "Segoe Print", "Bradley Hand", cursive';
export const FONT_EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export interface Paint {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	w: number;
	h: number;
}

export function paint(w: number, h: number): Paint {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D canvas unavailable');
	return { canvas, ctx, w, h };
}

export interface TextureOptions {
	repeat?: [number, number];
	/** Colour data (sRGB) unless it is a mask or a height/roughness map. */
	color?: boolean;
	anisotropy?: number;
}

export function toTexture(p: Paint | HTMLCanvasElement, options: TextureOptions = {}): THREE.CanvasTexture {
	const texture = new THREE.CanvasTexture('canvas' in p ? p.canvas : p);
	texture.colorSpace = options.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
	if (options.repeat) {
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		texture.repeat.set(options.repeat[0], options.repeat[1]);
	}
	texture.anisotropy = options.anisotropy ?? 4;
	texture.needsUpdate = true;
	return texture;
}

/** Wait (briefly) for the web fonts the textures use, so the first paint is not in a fallback face. */
export async function ensureFonts(timeoutMs = 2500): Promise<void> {
	if (typeof document === 'undefined' || !document.fonts) return;
	const faces = ['700 64px "Cinzel"', '600 48px "Caveat"', '500 32px "Jost"', '400 16px "Press Start 2P"'];
	const loads = Promise.all(faces.map((f) => document.fonts.load(f).catch(() => [])));
	await Promise.race([loads, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/** Scatter `count` translucent dots of random size and lightness: stone grain, snow sparkle, cork. */
export function speckle(
	p: Paint,
	rand: () => number,
	count: number,
	colors: string[],
	size: [number, number] = [0.5, 2.5],
	alpha: [number, number] = [0.08, 0.35]
): void {
	const { ctx, w, h } = p;
	for (let i = 0; i < count; i++) {
		ctx.globalAlpha = alpha[0] + rand() * (alpha[1] - alpha[0]);
		ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
		const r = size[0] + rand() * (size[1] - size[0]);
		ctx.beginPath();
		ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

/** A soft round sprite (white centre fading out) for particles: snow, embers, dust, smoke. */
export function softDot(size = 64, hardness = 0.25): THREE.CanvasTexture {
	const p = paint(size, size);
	const g = p.ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, 'rgb(255 255 255 / 1)');
	g.addColorStop(hardness, 'rgb(255 255 255 / 0.8)');
	g.addColorStop(1, 'rgb(255 255 255 / 0)');
	p.ctx.fillStyle = g;
	p.ctx.fillRect(0, 0, size, size);
	return toTexture(p);
}

/** Fit `text` on one line at the largest size ≤ `max` that stays within `width`. Returns the size used. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, width: number, max: number): number {
	let px = max;
	ctx.font = font(px);
	while (px > 8 && ctx.measureText(text).width > width) {
		px -= 2;
		ctx.font = font(px);
	}
	return px;
}

/** Word-wrap `text` into at most `maxLines` lines of `width`; the last line gets an ellipsis when cut. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (ctx.measureText(next).width <= width || !line) line = next;
		else {
			lines.push(line);
			line = word;
		}
	}
	if (line) lines.push(line);
	if (lines.length <= maxLines) return lines;
	const kept = lines.slice(0, maxLines);
	let last = kept[maxLines - 1];
	while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
	kept[maxLines - 1] = `${last.trimEnd()}…`;
	return kept;
}
