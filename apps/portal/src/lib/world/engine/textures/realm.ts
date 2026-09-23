// Textures of the overworld: carved stone, glowing runes, gate plaques, banners, flagstones, signposts.

import type * as THREE from 'three';
import { rng } from '../noise';
import { CLOTH, css, NIGHT, STONE, WOOD } from '../palette';
import { FONT_DISPLAY, FONT_EMOJI, FONT_HAND, fitText, paint, speckle, toTexture, type Paint } from './common';

/** Rough-cut stone blocks with mortar joints; `rows` courses high. */
export function stoneBlocks(seed: number, rows = 6, size = 256, base: number = STONE.mid): Paint {
	const rand = rng(seed);
	const p = paint(size, size);
	const { ctx } = p;
	ctx.fillStyle = css(STONE.mortar);
	ctx.fillRect(0, 0, size, size);
	const rowH = size / rows;
	for (let r = 0; r < rows; r++) {
		let x = -rand() * 40;
		while (x < size) {
			const w = 40 + rand() * 60;
			const shade = 0.82 + rand() * 0.3;
			const c = base;
			const rr = Math.min(255, ((c >> 16) & 255) * shade);
			const gg = Math.min(255, ((c >> 8) & 255) * shade);
			const bb = Math.min(255, (c & 255) * shade);
			ctx.fillStyle = `rgb(${rr} ${gg} ${bb})`;
			ctx.fillRect(x + 2, r * rowH + 2, w - 4, rowH - 4);
			x += w;
		}
	}
	speckle(p, rand, 1400, [css(STONE.light), css(STONE.dark), css(NIGHT.snow)], [0.4, 2.2], [0.05, 0.3]);
	return p;
}

export function stoneTexture(seed: number, repeat: [number, number] = [1, 1], rows = 6): THREE.CanvasTexture {
	return toTexture(stoneBlocks(seed, rows), { repeat });
}

/** One rune glyph: a vertical stave with branches, in the spirit of the Elder Futhark but invented here. */
function rune(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number): void {
	ctx.beginPath();
	ctx.moveTo(x + w / 2, y);
	ctx.lineTo(x + w / 2, y + h);
	const branches = 1 + Math.floor(rand() * 3);
	for (let i = 0; i < branches; i++) {
		const y1 = y + rand() * h * 0.7;
		const y2 = y1 + (rand() * 0.5 - 0.1) * h;
		const side = rand() < 0.5 ? x : x + w;
		ctx.moveTo(x + w / 2, y1);
		ctx.lineTo(side, Math.min(y + h, Math.max(y, y2)));
	}
	if (rand() < 0.3) {
		ctx.moveTo(x, y + h * 0.35);
		ctx.lineTo(x + w, y + h * 0.65);
	}
	ctx.stroke();
}

/**
 * Pillar faces: stone with a column of carved runes, plus an emissive mask of the same runes so they can
 * glow in the gate's colour (the material's emissive colour tints the white strokes).
 */
export function runePillar(seed: number): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
	const base = stoneBlocks(seed, 10, 256, STONE.light);
	const glow = paint(256, 256);
	glow.ctx.fillStyle = 'black';
	glow.ctx.fillRect(0, 0, 256, 256);
	const cells = 8;
	for (const target of [base, glow]) {
		const r2 = rng(seed + 7);
		target.ctx.lineCap = 'round';
		target.ctx.lineJoin = 'round';
		target.ctx.strokeStyle = target === base ? css(STONE.dark) : 'white';
		target.ctx.lineWidth = target === base ? 7 : 5;
		for (let i = 0; i < cells; i++) rune(target.ctx, 104, 10 + i * 30, 48, 22, r2);
	}
	return { map: toTexture(base, { repeat: [1, 1] }), glow: toTexture(glow, { color: false }) };
}

/** The dais inlay: two rings of runes around a compass star, white on black (an emissive mask). */
export function runeRing(seed: number): THREE.CanvasTexture {
	const p = paint(512, 512);
	const { ctx } = p;
	ctx.fillStyle = 'black';
	ctx.fillRect(0, 0, 512, 512);
	ctx.strokeStyle = 'white';
	ctx.lineCap = 'round';
	ctx.lineWidth = 4;
	for (const r of [240, 200, 120]) {
		ctx.beginPath();
		ctx.arc(256, 256, r, 0, Math.PI * 2);
		ctx.stroke();
	}
	const rand = rng(seed);
	for (let i = 0; i < 24; i++) {
		ctx.save();
		ctx.translate(256, 256);
		ctx.rotate((i / 24) * Math.PI * 2);
		rune(ctx, -10, -236, 20, 30, rand);
		ctx.restore();
	}
	ctx.lineWidth = 6;
	ctx.beginPath();
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
		const r = i % 2 ? 40 : 110;
		ctx.lineTo(256 + Math.cos(a) * r, 256 + Math.sin(a) * r);
	}
	ctx.closePath();
	ctx.stroke();
	return toTexture(p, { color: false });
}

/** A stone plaque with the gate's name in engraved capitals. */
export function plaque(name: string, sub: string): THREE.CanvasTexture {
	const p = paint(1024, 256);
	const { ctx } = p;
	const g = ctx.createLinearGradient(0, 0, 0, 256);
	g.addColorStop(0, css(STONE.light));
	g.addColorStop(1, css(STONE.mid));
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 1024, 256);
	speckle(p, rng(name.length * 31), 900, [css(STONE.dark), css(NIGHT.snow)], [0.5, 2], [0.05, 0.25]);
	ctx.strokeStyle = css(STONE.dark);
	ctx.lineWidth = 10;
	ctx.strokeRect(14, 14, 996, 228);
	ctx.lineWidth = 3;
	ctx.strokeRect(34, 34, 956, 188);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	const px = fitText(ctx, name.toUpperCase(), (n) => `700 ${n}px ${FONT_DISPLAY}`, 860, 112);
	// Carved look: a light lower edge under a dark fill.
	ctx.fillStyle = css(STONE.light);
	ctx.fillText(name.toUpperCase(), 512, 116 + 3);
	ctx.fillStyle = css(STONE.mortar);
	ctx.fillText(name.toUpperCase(), 512, 116);
	if (sub) {
		ctx.font = `600 ${Math.round(px * 0.34)}px ${FONT_DISPLAY}`;
		ctx.fillStyle = css(STONE.dark);
		ctx.fillText(sub.toUpperCase(), 512, 196);
	}
	return toTexture(p);
}

/** A hanging cloth banner in the gate's colour with its emblem and a gold trim. */
export function banner(icon: string, colour: number, dark: number): THREE.CanvasTexture {
	const p = paint(256, 512);
	const { ctx } = p;
	ctx.fillStyle = css(colour);
	ctx.fillRect(0, 0, 256, 512);
	const g = ctx.createLinearGradient(0, 0, 256, 0);
	g.addColorStop(0, css(dark, 0.55));
	g.addColorStop(0.5, css(dark, 0));
	g.addColorStop(1, css(dark, 0.55));
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 256, 512);
	ctx.strokeStyle = css(STONE.gold);
	ctx.lineWidth = 10;
	ctx.strokeRect(18, 18, 220, 440);
	// Swallow-tail cut at the bottom.
	ctx.globalCompositeOperation = 'destination-out';
	ctx.beginPath();
	ctx.moveTo(0, 512);
	ctx.lineTo(128, 440);
	ctx.lineTo(256, 512);
	ctx.fill();
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = css(dark, 0.6);
	ctx.beginPath();
	ctx.arc(128, 200, 78, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = css(STONE.gold);
	ctx.lineWidth = 6;
	ctx.stroke();
	ctx.font = `104px ${FONT_EMOJI}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(icon || '✦', 128, 206);
	speckle(p, rng(colour), 500, ['black', 'white'], [0.5, 1.5], [0.03, 0.1]);
	return toTexture(p);
}

/** Flagstones for the square: irregular cobbles with snow in the joints. */
export function flagstones(seed: number, repeat: number): THREE.CanvasTexture {
	const rand = rng(seed);
	const p = paint(512, 512);
	const { ctx } = p;
	ctx.fillStyle = css(NIGHT.snowShadow);
	ctx.fillRect(0, 0, 512, 512);
	for (let y = 0; y < 512; y += 64) {
		for (let x = (y / 64) % 2 ? -32 : 0; x < 512; x += 64) {
			const s = 0.8 + rand() * 0.35;
			const c = STONE.flagstone;
			ctx.fillStyle = `rgb(${((c >> 16) & 255) * s} ${((c >> 8) & 255) * s} ${(c & 255) * s})`;
			ctx.beginPath();
			ctx.roundRect(x + 4 + rand() * 3, y + 4 + rand() * 3, 56 - rand() * 6, 56 - rand() * 6, 10);
			ctx.fill();
		}
	}
	speckle(p, rand, 2500, [css(STONE.dark), css(NIGHT.snow)], [0.4, 1.8], [0.05, 0.3]);
	return toTexture(p, { repeat: [repeat, repeat] });
}

/** Faint grain for snow and rock: multiplied over vertex colours so the ground never looks like plastic. */
export function groundDetail(seed: number, repeat: number): THREE.CanvasTexture {
	const rand = rng(seed);
	const p = paint(256, 256);
	p.ctx.fillStyle = css(NIGHT.grainBase);
	p.ctx.fillRect(0, 0, 256, 256);
	speckle(p, rand, 5000, NIGHT.grain.map((c) => css(c)), [0.5, 2.5], [0.1, 0.5]);
	return toTexture(p, { repeat: [repeat, repeat] });
}

/** A wooden signpost board with carved lettering. */
export function signBoard(text: string, hand = false): THREE.CanvasTexture {
	const p = paint(512, 128);
	const { ctx } = p;
	ctx.fillStyle = css(WOOD.plank);
	ctx.fillRect(0, 0, 512, 128);
	const rand = rng(text.length * 13);
	for (let i = 0; i < 14; i++) {
		ctx.strokeStyle = css(WOOD.plankDark, 0.35);
		ctx.lineWidth = 1 + rand() * 2;
		ctx.beginPath();
		const y = rand() * 128;
		ctx.moveTo(0, y);
		ctx.bezierCurveTo(170, y + rand() * 10 - 5, 340, y + rand() * 10 - 5, 512, y);
		ctx.stroke();
	}
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fitText(ctx, text, (n) => (hand ? `700 ${n}px ${FONT_HAND}` : `700 ${n}px ${FONT_DISPLAY}`), 470, hand ? 86 : 64);
	ctx.fillStyle = css(WOOD.logDark);
	ctx.fillText(text, 256, 68);
	return toTexture(p);
}

/** The guard's tabard: Eisenhold's gate-and-mountain sigil on red. */
export function tabard(): THREE.CanvasTexture {
	const p = paint(128, 256);
	const { ctx } = p;
	ctx.fillStyle = css(CLOTH.guardTabard);
	ctx.fillRect(0, 0, 128, 256);
	ctx.strokeStyle = css(STONE.gold);
	ctx.lineWidth = 6;
	ctx.strokeRect(6, 6, 116, 244);
	ctx.fillStyle = css(STONE.gold);
	ctx.beginPath();
	ctx.moveTo(34, 150);
	ctx.lineTo(34, 96);
	ctx.quadraticCurveTo(64, 60, 94, 96);
	ctx.lineTo(94, 150);
	ctx.lineTo(80, 150);
	ctx.lineTo(80, 102);
	ctx.quadraticCurveTo(64, 82, 48, 102);
	ctx.lineTo(48, 150);
	ctx.closePath();
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(20, 196);
	ctx.lineTo(50, 164);
	ctx.lineTo(64, 178);
	ctx.lineTo(82, 158);
	ctx.lineTo(108, 196);
	ctx.closePath();
	ctx.fill();
	return toTexture(p);
}

/** Word Wall face: the apps and their versions carved as "words of power", runes above each. */
export function wordWall(lines: { name: string; version: string }[]): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
	const base = stoneBlocks(4242, 8, 1024, STONE.mid);
	const glow = paint(1024, 1024);
	glow.ctx.fillStyle = 'black';
	glow.ctx.fillRect(0, 0, 1024, 1024);
	for (const target of [base, glow]) {
		const { ctx } = target;
		const carved = target === base;
		ctx.lineCap = 'round';
		ctx.strokeStyle = carved ? css(STONE.dark) : 'white';
		ctx.lineWidth = carved ? 6 : 4;
		const r2 = rng(5);
		for (let row = 0; row < 3; row++) for (let i = 0; i < 18; i++) rune(ctx, 60 + i * 50, 60 + row * 70, 30, 44, r2);
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		lines.slice(0, 6).forEach((line, i) => {
			const y = 330 + i * 120;
			ctx.font = `700 64px ${FONT_DISPLAY}`;
			ctx.fillStyle = carved ? css(STONE.mortar) : 'white';
			ctx.fillText(line.name.toUpperCase(), 512, y);
			ctx.font = `600 34px ${FONT_DISPLAY}`;
			ctx.fillText(line.version, 512, y + 48);
		});
	}
	return { map: toTexture(base), glow: toTexture(glow, { color: false }) };
}
