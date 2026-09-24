// Textiles of the Jarl's story: hanging banners, a city gonfalon, felt pennants, a supporters' scarf and a hockey
// jersey. Shapes are cut out with alpha, so materials that use them set `alphaTest`.

import type * as THREE from 'three';
import { rng } from '../noise';
import { css } from '../palette';
import { FONT_DISPLAY, FONT_SANS, fitText, paint, speckle, toTexture, type Paint } from './common';

function weave(p: Paint, seed: number, ground: number): void {
	speckle(p, rng(seed), (p.w * p.h) / 60, [css(ground), 'black', 'white'], [0.4, 1.2], [0.02, 0.07]);
}

/** Cut the bottom of a hanging banner into a swallow tail. */
function swallowTail(p: Paint, depth: number): void {
	const { ctx, w, h } = p;
	ctx.globalCompositeOperation = 'destination-out';
	ctx.beginPath();
	ctx.moveTo(0, h);
	ctx.lineTo(w / 2, h - depth);
	ctx.lineTo(w, h);
	ctx.fill();
	ctx.globalCompositeOperation = 'source-over';
}

/** A tall banner: bands top and bottom, one big letter, a line of small capitals under it, a swallow tail. */
export function hangingBanner(big: string, small: string, ground: number, ink: number, band: number): THREE.CanvasTexture {
	const p = paint(256, 640);
	const { ctx } = p;
	ctx.fillStyle = css(ground);
	ctx.fillRect(0, 0, 256, 640);
	ctx.fillStyle = css(band);
	ctx.fillRect(0, 0, 256, 44);
	ctx.fillRect(0, 520, 256, 26);
	ctx.strokeStyle = css(ink);
	ctx.lineWidth = 6;
	ctx.strokeRect(14, 56, 228, 452);
	ctx.fillStyle = css(ink);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = `700 210px ${FONT_DISPLAY}`;
	ctx.fillText(big, 128, 250);
	fitText(ctx, small, (n) => `700 ${n}px ${FONT_DISPLAY}`, 208, 40);
	ctx.fillText(small, 128, 440);
	weave(p, big.charCodeAt(0), ground);
	swallowTail(p, 70);
	return toTexture(p);
}

/** A gonfalon in two colours, one over the other (a city's flag, hung from its top edge). */
export function gonfalon(top: number, bottom: number): THREE.CanvasTexture {
	const p = paint(256, 512);
	p.ctx.fillStyle = css(top);
	p.ctx.fillRect(0, 0, 256, 256);
	p.ctx.fillStyle = css(bottom);
	p.ctx.fillRect(0, 256, 256, 256);
	weave(p, 1557, top);
	swallowTail(p, 60);
	return toTexture(p);
}

/** A felt pennant, point to the right: a sleeve for the stick, a name and a smaller line, cut to a long triangle. */
export function pennant(title: string, sub: string, ground: number, ink: number, sleeve: number): THREE.CanvasTexture {
	const p = paint(1024, 384);
	const { ctx } = p;
	ctx.fillStyle = css(ground);
	ctx.fillRect(0, 0, 1024, 384);
	ctx.fillStyle = css(sleeve);
	ctx.fillRect(0, 0, 70, 384);
	ctx.fillStyle = css(ink);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fitText(ctx, title, (n) => `700 ${n}px ${FONT_DISPLAY}`, 560, 120);
	ctx.fillText(title, 400, 170);
	fitText(ctx, sub, (n) => `600 ${n}px ${FONT_SANS}`, 420, 52);
	ctx.fillText(sub, 380, 262);
	weave(p, title.length * 17, ground);
	ctx.globalCompositeOperation = 'destination-in';
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(1024, 192);
	ctx.lineTo(0, 384);
	ctx.closePath();
	ctx.fill();
	ctx.globalCompositeOperation = 'source-over';
	return toTexture(p);
}

/** A supporters' scarf: striped ends with a fringe, the club's name knitted along the middle. */
export function scarf(text: string, stripes: number[], ground: number, ink: number): THREE.CanvasTexture {
	const p = paint(1024, 128);
	const { ctx } = p;
	ctx.fillStyle = css(ground);
	ctx.fillRect(0, 0, 1024, 128);
	const end = 150;
	stripes.forEach((c, i) => {
		ctx.fillStyle = css(c);
		const w = end / stripes.length;
		ctx.fillRect(24 + i * w, 0, w, 128);
		ctx.fillRect(1024 - 24 - (i + 1) * w, 0, w, 128);
	});
	ctx.fillStyle = css(ink);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fitText(ctx, text, (n) => `700 ${n}px ${FONT_SANS}`, 1024 - 2 * (end + 60), 72);
	ctx.fillText(text, 512, 68);
	// Knit rows and a fringe at both ends.
	ctx.fillStyle = css(ink, 0.1);
	for (let y = 0; y < 128; y += 6) ctx.fillRect(24, y, 976, 2);
	ctx.globalCompositeOperation = 'destination-out';
	for (let y = 0; y < 128; y += 10) {
		ctx.fillRect(0, y + 5, 24, 5);
		ctx.fillRect(1000, y + 5, 24, 5);
	}
	ctx.globalCompositeOperation = 'source-over';
	return toTexture(p);
}

/** A hockey jersey seen from the back, sleeves out: a name bar and a big number, hem and sleeve stripes. */
export function jersey(name: string, number: string, body: number, stripe: number, trim: number): THREE.CanvasTexture {
	const p = paint(512, 512);
	const { ctx } = p;
	const half: [number, number][] = [
		[200, 34],
		[124, 56],
		[18, 178],
		[60, 262],
		[150, 204],
		[154, 488]
	];
	const outline = new Path2D();
	half.forEach(([x, y], i) => (i === 0 ? outline.moveTo(x, y) : outline.lineTo(x, y)));
	for (const [x, y] of [...half].reverse()) outline.lineTo(512 - x, y);
	outline.quadraticCurveTo(256, 60, 200, 34);
	outline.closePath();
	ctx.save();
	ctx.clip(outline);
	ctx.fillStyle = css(body);
	ctx.fillRect(0, 0, 512, 512);
	ctx.fillStyle = css(stripe);
	for (const [y, h] of [[408, 22], [442, 12]]) ctx.fillRect(0, y, 512, h);
	ctx.fillStyle = css(trim);
	for (const [y, h] of [[432, 8]]) ctx.fillRect(0, y, 512, h);
	// Sleeve stripes run across each sleeve near its cuff.
	for (const side of [-1, 1]) {
		ctx.save();
		ctx.translate(side < 0 ? 64 : 448, 176);
		ctx.rotate(side * -0.47);
		ctx.fillStyle = css(stripe);
		ctx.fillRect(-70, -8, 140, 16);
		ctx.fillStyle = css(trim);
		ctx.fillRect(-70, 10, 140, 6);
		ctx.restore();
	}
	ctx.fillStyle = css(trim);
	ctx.beginPath();
	ctx.moveTo(200, 34);
	ctx.quadraticCurveTo(256, 70, 312, 34);
	ctx.lineTo(300, 30);
	ctx.quadraticCurveTo(256, 56, 212, 30);
	ctx.fill();
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = css(trim);
	ctx.font = `700 40px ${FONT_SANS}`;
	ctx.fillText(name, 256, 120);
	ctx.font = `700 170px ${FONT_SANS}`;
	ctx.lineWidth = 10;
	ctx.strokeStyle = css(trim);
	ctx.strokeText(number, 256, 262);
	ctx.fillStyle = css(stripe);
	ctx.fillText(number, 256, 262);
	weave(p, 19, body);
	ctx.restore();
	return toTexture(p);
}
