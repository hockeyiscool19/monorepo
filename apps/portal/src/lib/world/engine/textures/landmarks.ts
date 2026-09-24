// Textures of the Jarl's landmarks: the Heartcell's wrap, the legend's carved plaque, the relic panel, solar cells,
// Cuenca's glazed dome tiles, barn-red siding, brick, rink boards, goal netting, painted signs and banners, a
// Supercharger stall and a soccer ball. Painted at load time like the rest of Eisenhold.

import type * as THREE from 'three';
import { rng } from '../noise';
import { CELL, css, CUENCA, NREL, RINK, STONE, TESLA, VERMONT } from '../palette';
import { FONT_DISPLAY, FONT_HAND, FONT_SANS, fitText, paint, speckle, toTexture, type Paint } from './common';
import { rune } from './realm';

type Tex = THREE.CanvasTexture;

function shade(hex: number, k: number): string {
	const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
	return `rgb(${f((hex >> 16) & 255)} ${f((hex >> 8) & 255)} ${f(hex & 255)})`;
}

/** Text repeated `times` across the full width, squeezed so the last copy meets the first around a cylinder. */
function band(ctx: CanvasRenderingContext2D, text: string, y: number, width: number, times: number): void {
	const natural = ctx.measureText(text).width * times;
	ctx.save();
	ctx.scale(width / natural, 1);
	for (let i = 0; i < times; i++) ctx.fillText(text, (i * natural) / times, y);
	ctx.restore();
}

/**
 * The Heartcell's wrap, around the can: steel ends marked + and −, a midnight label with its name in gold, rune
 * rows, and an emissive mask of the same marks so they glow in the charge colour. Five bands are left bare for
 * the charge rings the engine draws over them.
 */
export function cellWrap(): { map: Tex; glow: Tex } {
	const W = 1024;
	const H = 512;
	const base = paint(W, H);
	const glow = paint(W, H);
	const { ctx } = base;
	ctx.fillStyle = css(CELL.steel);
	ctx.fillRect(0, 0, W, H);
	const rand = rng(4680);
	for (let i = 0; i < 260; i++) {
		ctx.fillStyle = css(CELL.steelDark, 0.05 + rand() * 0.08);
		ctx.fillRect(0, rand() * H, W, 1);
	}
	ctx.fillStyle = css(CELL.wrap);
	ctx.fillRect(0, H * 0.1, W, H * 0.8);
	speckle(base, rand, 900, [css(CELL.chargeDeep), css(CELL.relicLine)], [0.5, 1.6], [0.08, 0.3]);
	ctx.fillStyle = css(STONE.gold);
	ctx.fillRect(0, H * 0.1 - 3, W, 6);
	ctx.fillRect(0, H * 0.9 - 3, W, 6);
	glow.ctx.fillStyle = 'black';
	glow.ctx.fillRect(0, 0, W, H);
	for (const target of [base, glow]) {
		const c = target.ctx;
		const lit = target === glow;
		c.textAlign = 'left';
		c.textBaseline = 'middle';
		c.fillStyle = lit ? 'white' : css(STONE.gold);
		c.font = `700 44px ${FONT_DISPLAY}`;
		band(c, 'HEARTCELL  ✦  4680  ✦  ∞  ✦  ', 104, W, 2);
		c.strokeStyle = lit ? 'white' : css(CELL.charge);
		c.lineWidth = 3;
		c.lineCap = 'round';
		const r2 = rng(19);
		for (let i = 0; i < 32; i++) rune(c, 8 + i * 32, 134, 14, 20, r2);
		for (let i = 0; i < 32; i++) rune(c, 8 + i * 32, 428, 14, 20, r2);
		if (!lit) {
			// The poles of a battery, stamped into the steel.
			c.fillStyle = css(CELL.steelDark);
			c.textAlign = 'center';
			c.font = `700 40px ${FONT_SANS}`;
			for (const u of [0.25, 0.75]) {
				c.fillText('+', u * W, 26);
				c.fillText('−', u * W, H - 26);
			}
		}
	}
	return { map: toTexture(base), glow: toTexture(glow, { color: false }) };
}

/**
 * The lectern's carved plaque: the legend of the panel in engraved capitals, plus an emissive mask of the letters so
 * the carving glows faintly and reads at night, like the runes on the gates.
 */
export function legendPlaque(): { map: Tex; glow: Tex } {
	const p = paint(1024, 640);
	const glow = paint(1024, 640);
	const { ctx } = p;
	const g = ctx.createLinearGradient(0, 0, 0, 640);
	g.addColorStop(0, css(STONE.light));
	g.addColorStop(1, css(STONE.mid));
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 1024, 640);
	speckle(p, rng(2006), 1400, [css(STONE.dark), css(STONE.light)], [0.5, 2.2], [0.05, 0.28]);
	ctx.strokeStyle = css(STONE.dark);
	ctx.lineWidth = 12;
	ctx.strokeRect(16, 16, 992, 608);
	ctx.lineWidth = 3;
	ctx.strokeRect(38, 38, 948, 564);
	glow.ctx.fillStyle = 'black';
	glow.ctx.fillRect(0, 0, 1024, 640);
	for (const c of [ctx, glow.ctx]) {
		c.textAlign = 'center';
		c.textBaseline = 'middle';
	}
	const carve = (text: string, y: number, px: number, weight = 700) => {
		const font = (n: number) => `${weight} ${n}px ${FONT_DISPLAY}`;
		fitText(ctx, text, font, 900, px);
		glow.ctx.font = ctx.font;
		ctx.fillStyle = css(STONE.light);
		ctx.fillText(text, 512, y + 3);
		ctx.fillStyle = css(STONE.mortar);
		ctx.fillText(text, 512, y);
		glow.ctx.fillStyle = 'white';
		glow.ctx.fillText(text, 512, y);
	};
	carve('THE LEGEND OF THE PANEL', 110, 70);
	ctx.fillStyle = css(STONE.dark);
	ctx.fillRect(312, 168, 400, 4);
	carve('AT NREL, IN GOLDEN, COLORADO,', 250, 52);
	carve('BUSH INVENTED', 334, 60);
	carve('THE SOLAR PANEL.', 410, 60);
	carve('— SO THE LEGEND GOES —', 520, 34, 600);
	return { map: toTexture(p), glow: toTexture(glow, { color: false }) };
}

function cells(p: Paint, cols: number, rows: number, inset: number, cell: number, line: number, rand: () => number): void {
	const { ctx, w, h } = p;
	const cw = (w - inset * 2) / cols;
	const ch = (h - inset * 2) / rows;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const x = inset + c * cw;
			const y = inset + r * ch;
			const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
			g.addColorStop(0, shade(cell, 1.15 + rand() * 0.1));
			g.addColorStop(1, shade(cell, 0.8));
			ctx.fillStyle = g;
			ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
			ctx.fillStyle = css(line, 0.55);
			for (const k of [0.33, 0.66]) ctx.fillRect(x + cw * k, y + 2, 1.5, ch - 4);
		}
	}
}

/** The relic on the lectern: the first solar panel, if you believe the legend — old cells in a gilded frame. */
export function relicCells(): { map: Tex; glow: Tex } {
	const base = paint(512, 320);
	base.ctx.fillStyle = css(STONE.gold);
	base.ctx.fillRect(0, 0, 512, 320);
	base.ctx.fillStyle = css(CELL.relicLine);
	base.ctx.fillRect(18, 18, 476, 284);
	cells(base, 6, 4, 22, CELL.relic, CELL.relicLine, rng(1954));
	const glow = paint(512, 320);
	glow.ctx.fillStyle = 'black';
	glow.ctx.fillRect(0, 0, 512, 320);
	glow.ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
	for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) glow.ctx.fillRect(22 + c * 78 + 6, 22 + r * 69 + 6, 66, 57);
	return { map: toTexture(base), glow: toTexture(glow, { color: false }) };
}

/** A modern panel: ten by six cells with bright busbars in an aluminium frame. */
export function solarCells(seed = 1977): Tex {
	const p = paint(512, 320);
	p.ctx.fillStyle = css(NREL.frame);
	p.ctx.fillRect(0, 0, 512, 320);
	p.ctx.fillStyle = css(NREL.panel);
	p.ctx.fillRect(8, 8, 496, 304);
	cells(p, 10, 6, 10, NREL.cell, NREL.grid, rng(seed));
	return toTexture(p);
}

/** Glazed tiles for Cuenca's domes: blue tiles of slightly different glazes, white ribs and a white base band. */
export function domeTiles(): Tex {
	const p = paint(512, 256);
	const { ctx } = p;
	const rand = rng(1885);
	for (let y = 0; y < 256; y += 16) {
		for (let x = 0; x < 512; x += 16) {
			ctx.fillStyle = shade(CUENCA.domeBlue, 0.85 + rand() * 0.35);
			ctx.fillRect(x, y, 15, 15);
		}
	}
	ctx.fillStyle = css(CUENCA.domeWhite);
	for (let i = 0; i < 12; i++) ctx.fillRect((i / 12) * 512 - 3, 0, 6, 256);
	ctx.fillRect(0, 226, 512, 30);
	ctx.fillRect(0, 150, 512, 5);
	ctx.fillStyle = css(CUENCA.domeWhite, 0.18);
	ctx.fillRect(0, 0, 512, 60);
	return toTexture(p);
}

/** Barn-red board-and-batten siding, weathered. */
export function siding(): Tex {
	const p = paint(512, 512);
	const { ctx } = p;
	const rand = rng(1829);
	for (let x = 0; x < 512; x += 32) {
		ctx.fillStyle = shade(VERMONT.barn, 0.88 + rand() * 0.22);
		ctx.fillRect(x, 0, 32, 512);
		ctx.fillStyle = css(VERMONT.barnDark);
		ctx.fillRect(x, 0, 6, 512);
	}
	speckle(p, rand, 2200, [css(VERMONT.barnDark), css(VERMONT.trim)], [0.4, 1.6], [0.04, 0.18]);
	return toTexture(p, { repeat: [1, 1] });
}

/** Running-bond brick with mortar joints. */
export function bricks(seed: number, base: number, mortar: number, repeat: [number, number]): Tex {
	const p = paint(512, 512);
	const { ctx } = p;
	const rand = rng(seed);
	ctx.fillStyle = css(mortar);
	ctx.fillRect(0, 0, 512, 512);
	for (let row = 0; row < 512 / 28; row++) {
		for (let x = row % 2 ? -32 : 0; x < 512; x += 64) {
			ctx.fillStyle = shade(base, 0.82 + rand() * 0.3);
			ctx.fillRect(x + 2, row * 28 + 2, 60, 24);
		}
	}
	speckle(p, rand, 1600, [css(mortar), shade(base, 1.3)], [0.4, 1.4], [0.05, 0.2]);
	return toTexture(p, { repeat });
}

/** Rink boards: painted plywood with a yellow kick plate and puck marks. */
export function rinkBoards(): Tex {
	const p = paint(512, 128);
	const { ctx } = p;
	ctx.fillStyle = css(RINK.boards);
	ctx.fillRect(0, 0, 512, 128);
	ctx.fillStyle = css(RINK.kick);
	ctx.fillRect(0, 100, 512, 28);
	const rand = rng(19);
	for (let i = 0; i < 40; i++) {
		ctx.fillStyle = css(RINK.puck, 0.15 + rand() * 0.3);
		ctx.beginPath();
		ctx.ellipse(rand() * 512, 60 + rand() * 60, 3 + rand() * 6, 1.5 + rand() * 2, rand() * 0.6, 0, Math.PI * 2);
		ctx.fill();
	}
	return toTexture(p, { repeat: [1, 1] });
}

/** Goal netting: a diamond mesh on transparency. */
export function netMesh(colour: number): Tex {
	const p = paint(128, 128);
	const { ctx } = p;
	ctx.strokeStyle = css(colour, 0.9);
	ctx.lineWidth = 2.5;
	for (let i = -128; i <= 256; i += 32) {
		ctx.beginPath();
		ctx.moveTo(i, 0);
		ctx.lineTo(i + 128, 128);
		ctx.moveTo(i, 128);
		ctx.lineTo(i + 128, 0);
		ctx.stroke();
	}
	return toTexture(p, { repeat: [3, 2] });
}

export interface BoardStyle {
	ground: number;
	ink: number;
	border?: number;
	font?: 'display' | 'sans' | 'hand';
	w?: number;
	h?: number;
}

/** A painted board or banner: a coloured ground, an optional border, a headline and smaller lines under it. */
export function paintedBoard(lines: string[], style: BoardStyle): Tex {
	const w = style.w ?? 512;
	const h = style.h ?? 128;
	const p = paint(w, h);
	const { ctx } = p;
	ctx.fillStyle = css(style.ground);
	ctx.fillRect(0, 0, w, h);
	speckle(p, rng(lines.join('').length * 7), (w * h) / 90, [shade(style.ground, 0.8), shade(style.ground, 1.2)], [0.5, 1.8], [0.05, 0.2]);
	if (style.border !== undefined) {
		ctx.strokeStyle = css(style.border);
		ctx.lineWidth = Math.max(6, h * 0.06);
		ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
	}
	const face = style.font === 'hand' ? FONT_HAND : style.font === 'sans' ? FONT_SANS : FONT_DISPLAY;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = css(style.ink);
	const head = lines.length === 1 ? h * 0.52 : h * 0.34;
	const rest = (h * 0.5) / Math.max(1, lines.length - 1);
	lines.forEach((line, i) => {
		const max = i === 0 ? head : Math.min(rest * 0.8, head * 0.55);
		fitText(ctx, line, (n) => `700 ${n}px ${face}`, w * 0.88, Math.round(max));
		const y = i === 0 ? (lines.length === 1 ? h * 0.54 : h * 0.34) : h * 0.62 + (i - 1) * rest;
		ctx.fillText(line, w / 2, y);
	});
	return toTexture(p);
}

/** A Supercharger stall's face: white, a red light bar, a lightning bolt. Plus the emissive mask of the light. */
export function stallFace(): { map: Tex; glow: Tex } {
	const base = paint(128, 512);
	const glow = paint(128, 512);
	base.ctx.fillStyle = css(TESLA.stall);
	base.ctx.fillRect(0, 0, 128, 512);
	glow.ctx.fillStyle = 'black';
	glow.ctx.fillRect(0, 0, 128, 512);
	for (const target of [base, glow]) {
		const c = target.ctx;
		c.fillStyle = target === glow ? 'white' : css(TESLA.stallRed);
		c.fillRect(88, 40, 16, 400);
		c.beginPath();
		c.moveTo(56, 60);
		c.lineTo(30, 120);
		c.lineTo(52, 120);
		c.lineTo(40, 170);
		c.lineTo(74, 104);
		c.lineTo(52, 104);
		c.lineTo(64, 60);
		c.closePath();
		c.fill();
	}
	return { map: toTexture(base), glow: toTexture(glow, { color: false }) };
}

/** A soccer ball, equirectangular: twelve pentagons where an icosahedron's corners meet the sphere. */
export function soccerBall(): Tex {
	const W = 512;
	const H = 256;
	const p = paint(W, H);
	const { ctx } = p;
	ctx.fillStyle = css(CUENCA.ball);
	ctx.fillRect(0, 0, W, H);
	const t = (1 + Math.sqrt(5)) / 2;
	const corners = [
		[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
		[0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
		[t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
	].map(([x, y, z]) => {
		const l = Math.hypot(x, y, z);
		return [x / l, y / l, z / l];
	});
	const uv = ([x, y, z]: number[]): [number, number] => [(Math.atan2(z, x) / (Math.PI * 2) + 0.5) * W, (Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI) * H];
	ctx.fillStyle = css(CUENCA.patch);
	for (const c of corners) {
		// An orthonormal basis around the corner, then five points 0.22 rad out.
		const ref = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
		const a = [c[1] * ref[2] - c[2] * ref[1], c[2] * ref[0] - c[0] * ref[2], c[0] * ref[1] - c[1] * ref[0]];
		const al = Math.hypot(a[0], a[1], a[2]);
		const e1 = a.map((v) => v / al);
		const e2 = [c[1] * e1[2] - c[2] * e1[1], c[2] * e1[0] - c[0] * e1[2], c[0] * e1[1] - c[1] * e1[0]];
		const pts = Array.from({ length: 24 }, (_, i) => {
			const k = (i / 24) * Math.PI * 2;
			const r = 0.24 * (0.9 + 0.1 * Math.cos(5 * k));
			return uv(c.map((v, j) => v * Math.cos(r) + (e1[j] * Math.cos(k) + e2[j] * Math.sin(k)) * Math.sin(r)));
		});
		for (const shift of [-W, 0, W]) {
			ctx.beginPath();
			let prev = pts[0][0];
			pts.forEach(([x, y], i) => {
				// Unwrap across the seam so a pentagon that straddles u = 0 stays in one piece.
				const ux = x + Math.round((prev - x) / W) * W;
				prev = ux;
				if (i === 0) ctx.moveTo(ux + shift, y);
				else ctx.lineTo(ux + shift, y);
			});
			ctx.closePath();
			ctx.fill();
		}
	}
	return toTexture(p);
}
