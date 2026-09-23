// Textures of My Get-a-way: log walls, floorboards, the rug, cork, sticky notes, the drafting sheet,
// a Colorado postcard and pennant, and soft clouds for the view out of the window.

import type * as THREE from 'three';
import { rng } from '../noise';
import { COLORADO, css, GETAWAY, STICKY } from '../palette';
import { FONT_DISPLAY, FONT_HAND, FONT_SANS, fitText, paint, speckle, toTexture, wrapText } from './common';

/** Horizontal logs (walls) or boards (floor), with grain lines and knots. */
export function wood(seed: number, kind: 'logs' | 'boards', base: number, dark: number, repeat: [number, number]): THREE.CanvasTexture {
	const rand = rng(seed);
	const p = paint(512, 512);
	const { ctx } = p;
	const courses = kind === 'logs' ? 6 : 8;
	const h = 512 / courses;
	for (let i = 0; i < courses; i++) {
		const shade = 0.86 + rand() * 0.24;
		const r = ((base >> 16) & 255) * shade;
		const g = ((base >> 8) & 255) * shade;
		const b = (base & 255) * shade;
		if (kind === 'logs') {
			const grad = ctx.createLinearGradient(0, i * h, 0, (i + 1) * h);
			grad.addColorStop(0, css(dark));
			grad.addColorStop(0.18, `rgb(${r} ${g} ${b})`);
			grad.addColorStop(0.75, `rgb(${r * 0.92} ${g * 0.92} ${b * 0.92})`);
			grad.addColorStop(1, css(dark));
			ctx.fillStyle = grad;
			ctx.fillRect(0, i * h, 512, h);
		} else {
			ctx.fillStyle = `rgb(${r} ${g} ${b})`;
			ctx.fillRect(0, i * h, 512, h - 3);
			ctx.fillStyle = css(dark);
			ctx.fillRect(0, (i + 1) * h - 3, 512, 3);
			const joint = rand() * 512;
			ctx.fillRect(joint, i * h, 3, h);
		}
		for (let l = 0; l < 9; l++) {
			ctx.strokeStyle = css(dark, 0.18 + rand() * 0.2);
			ctx.lineWidth = 0.6 + rand() * 1.4;
			const y = i * h + 6 + rand() * (h - 12);
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.bezierCurveTo(128, y + rand() * 6 - 3, 384, y + rand() * 6 - 3, 512, y + rand() * 4 - 2);
			ctx.stroke();
		}
		if (rand() < 0.6) {
			ctx.fillStyle = css(dark, 0.55);
			ctx.beginPath();
			ctx.ellipse(rand() * 512, i * h + h / 2, 7 + rand() * 6, 4 + rand() * 3, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	speckle(p, rand, 1200, [css(dark), css(base)], [0.4, 1.4], [0.05, 0.2]);
	return toTexture(p, { repeat });
}

/** A wool rug: a red field, cream border and a row of blue diamonds. */
export function rug(): THREE.CanvasTexture {
	const p = paint(512, 384);
	const { ctx } = p;
	ctx.fillStyle = css(GETAWAY.rugRed);
	ctx.fillRect(0, 0, 512, 384);
	ctx.strokeStyle = css(GETAWAY.rugCream);
	ctx.lineWidth = 22;
	ctx.strokeRect(20, 20, 472, 344);
	ctx.lineWidth = 6;
	ctx.strokeRect(46, 46, 420, 292);
	ctx.fillStyle = css(GETAWAY.rugBlue);
	for (let i = 0; i < 5; i++) {
		const cx = 106 + i * 75;
		ctx.beginPath();
		ctx.moveTo(cx, 150);
		ctx.lineTo(cx + 28, 192);
		ctx.lineTo(cx, 234);
		ctx.lineTo(cx - 28, 192);
		ctx.closePath();
		ctx.fill();
	}
	speckle(p, rng(7), 3000, [css(GETAWAY.rugCream), 'black'], [0.4, 1.2], [0.04, 0.12]);
	return toTexture(p);
}

export function cork(seed: number): THREE.CanvasTexture {
	const rand = rng(seed);
	const p = paint(512, 512);
	p.ctx.fillStyle = css(GETAWAY.cork);
	p.ctx.fillRect(0, 0, 512, 512);
	speckle(p, rand, 9000, [css(GETAWAY.corkDark), css(GETAWAY.corkLight), css(GETAWAY.corkShadow)], [0.5, 2.4], [0.25, 0.7]);
	return toTexture(p);
}

export interface StickyFace {
	key: string;
	title: string;
	priority: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
	type: 'idea' | 'feature' | 'fix' | 'chore';
	done: boolean;
}

const ARROWS: Record<StickyFace['priority'], string> = { highest: '⇈', high: '↑', medium: '=', low: '↓', lowest: '⇊' };

/** One sticky note: the key, the title in handwriting, a priority mark, and a gold star once it is done. */
export function sticky(face: StickyFace): THREE.CanvasTexture {
	const p = paint(256, 256);
	const { ctx } = p;
	const paper = STICKY[face.type];
	const g = ctx.createLinearGradient(0, 0, 0, 256);
	g.addColorStop(0, css(paper));
	g.addColorStop(1, css(paper, 0.92));
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 256, 256);
	// The glue strip at the top is a shade darker.
	ctx.fillStyle = css(STICKY.ink, 0.06);
	ctx.fillRect(0, 0, 256, 34);
	ctx.fillStyle = css(STICKY.ink);
	ctx.font = `600 26px ${FONT_SANS}`;
	ctx.textBaseline = 'top';
	ctx.fillText(face.key, 16, 42);
	ctx.textAlign = 'right';
	ctx.font = `700 30px ${FONT_SANS}`;
	ctx.fillText(ARROWS[face.priority], 240, 38);
	ctx.textAlign = 'left';
	ctx.font = `600 38px ${FONT_HAND}`;
	wrapText(ctx, face.title, 224, 4).forEach((line, i) => ctx.fillText(line, 16, 80 + i * 40));
	if (face.done) {
		ctx.fillStyle = css(STICKY.star);
		ctx.beginPath();
		for (let i = 0; i < 10; i++) {
			const r = i % 2 ? 11 : 26;
			const a = -Math.PI / 2 + (i * Math.PI) / 5;
			ctx.lineTo(214 + Math.cos(a) * r, 214 + Math.sin(a) * r);
		}
		ctx.closePath();
		ctx.fill();
	}
	return toTexture(p);
}

/** A column header card for the cork board ("TO DO"). */
export function indexCard(text: string): THREE.CanvasTexture {
	const p = paint(256, 96);
	const { ctx } = p;
	ctx.fillStyle = css(GETAWAY.paper);
	ctx.fillRect(0, 0, 256, 96);
	ctx.strokeStyle = css(GETAWAY.cardRule, 0.8);
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(0, 26);
	ctx.lineTo(256, 26);
	ctx.stroke();
	ctx.strokeStyle = css(GETAWAY.cardLine, 0.6);
	for (let y = 50; y < 96; y += 22) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(256, y);
		ctx.stroke();
	}
	ctx.fillStyle = css(STICKY.ink);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fitText(ctx, text, (n) => `700 ${n}px ${FONT_HAND}`, 230, 52);
	ctx.fillText(text, 128, 58);
	return toTexture(p);
}

/** The drafting sheet: blueprint grid, a sketch of a gate, and the newest idea's title pencilled in. */
export function draftingSheet(title: string, count: number): THREE.CanvasTexture {
	const p = paint(1024, 768);
	const { ctx } = p;
	ctx.fillStyle = css(GETAWAY.paper);
	ctx.fillRect(0, 0, 1024, 768);
	ctx.strokeStyle = css(GETAWAY.blueprint, 0.14);
	ctx.lineWidth = 1;
	for (let x = 0; x <= 1024; x += 32) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, 768);
		ctx.stroke();
	}
	for (let y = 0; y <= 768; y += 32) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(1024, y);
		ctx.stroke();
	}
	ctx.strokeStyle = css(GETAWAY.graphite, 0.85);
	ctx.lineWidth = 3;
	ctx.lineCap = 'round';
	// A pencil sketch of an arch with measurement ticks.
	ctx.beginPath();
	ctx.moveTo(620, 640);
	ctx.lineTo(620, 330);
	ctx.quadraticCurveTo(740, 210, 860, 330);
	ctx.lineTo(860, 640);
	ctx.moveTo(660, 640);
	ctx.lineTo(660, 350);
	ctx.quadraticCurveTo(740, 262, 820, 350);
	ctx.lineTo(820, 640);
	ctx.stroke();
	ctx.setLineDash([10, 8]);
	ctx.beginPath();
	ctx.moveTo(600, 680);
	ctx.lineTo(880, 680);
	ctx.stroke();
	ctx.setLineDash([]);
	ctx.fillStyle = css(GETAWAY.graphite);
	ctx.font = `600 34px ${FONT_HAND}`;
	ctx.fillText('4.6 m', 710, 720);
	ctx.font = `700 64px ${FONT_HAND}`;
	ctx.fillText('Next great idea:', 60, 110);
	ctx.font = `600 52px ${FONT_HAND}`;
	wrapText(ctx, title || 'something wonderful…', 500, 4).forEach((line, i) => ctx.fillText(line, 60, 200 + i * 62));
	ctx.font = `600 36px ${FONT_HAND}`;
	ctx.fillText(`${count} note${count === 1 ? '' : 's'} on the cork board`, 60, 690);
	return toTexture(p);
}

/** "Greetings from Colorado" postcard with a painted twin-peak range. */
export function postcard(): THREE.CanvasTexture {
	const p = paint(512, 340);
	const { ctx } = p;
	const sky = ctx.createLinearGradient(0, 0, 0, 340);
	sky.addColorStop(0, css(COLORADO.skyTop));
	sky.addColorStop(1, css(COLORADO.skyHorizon));
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, 512, 340);
	ctx.fillStyle = css(COLORADO.maroon);
	ctx.beginPath();
	ctx.moveTo(0, 260);
	ctx.lineTo(150, 110);
	ctx.lineTo(210, 170);
	ctx.lineTo(290, 90);
	ctx.lineTo(512, 260);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = css(COLORADO.snow);
	for (const [x, y] of [[150, 110], [290, 90]]) {
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x - 26, y + 34);
		ctx.lineTo(x + 30, y + 36);
		ctx.closePath();
		ctx.fill();
	}
	ctx.fillStyle = css(COLORADO.aspenGold[0]);
	ctx.fillRect(0, 250, 512, 90);
	ctx.fillStyle = css(COLORADO.lake);
	ctx.fillRect(0, 286, 512, 54);
	ctx.fillStyle = css(COLORADO.snow);
	ctx.font = `700 40px ${FONT_DISPLAY}`;
	ctx.textAlign = 'center';
	ctx.fillText('GREETINGS FROM', 256, 46);
	ctx.font = `700 64px ${FONT_DISPLAY}`;
	ctx.strokeStyle = css(COLORADO.maroonDark);
	ctx.lineWidth = 6;
	ctx.strokeText('COLORADO', 256, 108);
	ctx.fillText('COLORADO', 256, 108);
	ctx.strokeStyle = css(COLORADO.snow);
	ctx.lineWidth = 14;
	ctx.strokeRect(0, 0, 512, 340);
	return toTexture(p);
}

/** The Colorado state flag as a pennant: blue–white–blue, a red C around a gold disc. */
export function coloradoPennant(): THREE.CanvasTexture {
	const p = paint(512, 256);
	const { ctx } = p;
	ctx.fillStyle = css(COLORADO.flag.blue);
	ctx.fillRect(0, 0, 512, 256);
	ctx.fillStyle = css(COLORADO.flag.white);
	ctx.fillRect(0, 256 / 3, 512, 256 / 3);
	ctx.fillStyle = css(COLORADO.flag.red);
	ctx.beginPath();
	ctx.arc(190, 128, 88, Math.PI * 0.25, Math.PI * 1.75);
	ctx.arc(190, 128, 44, Math.PI * 1.75, Math.PI * 0.25, true);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = css(COLORADO.flag.gold);
	ctx.beginPath();
	ctx.arc(190, 128, 40, 0, Math.PI * 2);
	ctx.fill();
	// Pennant: cut into a long triangle.
	ctx.globalCompositeOperation = 'destination-in';
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(512, 128);
	ctx.lineTo(0, 256);
	ctx.closePath();
	ctx.fill();
	ctx.globalCompositeOperation = 'source-over';
	return toTexture(p);
}

/** A soft cumulus puff (alpha) for sprites in the Colorado sky. */
export function cloud(seed: number): THREE.CanvasTexture {
	const rand = rng(seed);
	const p = paint(256, 128);
	const { ctx } = p;
	for (let i = 0; i < 14; i++) {
		const x = 40 + rand() * 176;
		const y = 50 + rand() * 40 - (Math.abs(x - 128) < 50 ? 18 : 0);
		const r = 20 + rand() * 30;
		const g = ctx.createRadialGradient(x, y, 0, x, y, r);
		g.addColorStop(0, css(COLORADO.cloud, 0.9));
		g.addColorStop(1, css(COLORADO.cloud, 0));
		ctx.fillStyle = g;
		ctx.fillRect(x - r, y - r, r * 2, r * 2);
	}
	return toTexture(p);
}

/** Book spines for the shelf: a strip of coloured spines with gilt bands. */
export function bookSpines(seed: number): THREE.CanvasTexture {
	const rand = rng(seed);
	const p = paint(512, 128);
	const { ctx } = p;
	let x = 0;
	while (x < 512) {
		const w = 14 + rand() * 22;
		const h = 90 + rand() * 38;
		ctx.fillStyle = css(GETAWAY.book[Math.floor(rand() * GETAWAY.book.length)]);
		ctx.fillRect(x, 128 - h, w - 2, h);
		ctx.fillStyle = css(GETAWAY.gilt, 0.8);
		ctx.fillRect(x + 2, 128 - h + 12, w - 6, 3);
		ctx.fillRect(x + 2, 128 - 18, w - 6, 3);
		x += w;
	}
	return toTexture(p);
}
