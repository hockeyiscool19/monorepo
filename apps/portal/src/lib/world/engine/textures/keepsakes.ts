// Painted keepsakes of the Jarl's story: an oil sketch of Vermont, a poster of Cuenca, a maple syrup label, an NREL
// visitor badge, and a basketball backboard for the Wildcats' hoop.

import type * as THREE from 'three';
import { rng } from '../noise';
import { COLORADO, css, CUENCA, DAVIDSON, NREL, VERMONT } from '../palette';
import { FONT_DISPLAY, FONT_HAND, FONT_SANS, fitText, paint, speckle, toTexture, type Paint } from './common';

/** Short, dabbed strokes of one colour inside a band: the look of a quick oil sketch. */
function dabs(p: Paint, rand: () => number, count: number, colors: readonly number[], x: [number, number], y: [number, number], size: number): void {
	const { ctx } = p;
	for (let i = 0; i < count; i++) {
		ctx.fillStyle = css(colors[Math.floor(rand() * colors.length)], 0.85);
		ctx.beginPath();
		ctx.ellipse(x[0] + rand() * (x[1] - x[0]), y[0] + rand() * (y[1] - y[0]), size * (0.6 + rand()), size * (0.3 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
		ctx.fill();
	}
}

function ridge(p: Paint, rand: () => number, base: number, amp: number, color: number): void {
	const { ctx, w, h } = p;
	ctx.fillStyle = css(color);
	ctx.beginPath();
	ctx.moveTo(0, h);
	for (let x = 0; x <= w; x += 16) ctx.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin(x * 0.012 + rand() * 0.4)) - rand() * amp * 0.3);
	ctx.lineTo(w, h);
	ctx.closePath();
	ctx.fill();
}

/** Vermont in October: the Green Mountains, a river, a red covered bridge and maples on fire. */
export function vermontPainting(): THREE.CanvasTexture {
	const p = paint(640, 480);
	const { ctx } = p;
	const rand = rng(1777);
	const sky = ctx.createLinearGradient(0, 0, 0, 260);
	sky.addColorStop(0, css(VERMONT.sky));
	sky.addColorStop(1, css(VERMONT.dusk));
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, 640, 480);
	VERMONT.mountains.forEach((c, i) => ridge(p, rand, 200 + i * 45, 90 - i * 22, c));
	dabs(p, rand, 260, VERMONT.leaves, [0, 640], [270, 400], 9);
	ctx.fillStyle = css(VERMONT.river);
	ctx.beginPath();
	ctx.moveTo(0, 430);
	ctx.bezierCurveTo(200, 380, 380, 470, 640, 400);
	ctx.lineTo(640, 450);
	ctx.bezierCurveTo(380, 500, 200, 420, 0, 480);
	ctx.closePath();
	ctx.fill();
	// The covered bridge over the river.
	ctx.fillStyle = css(VERMONT.barn);
	ctx.fillRect(250, 360, 190, 56);
	ctx.fillStyle = css(VERMONT.roof);
	ctx.beginPath();
	ctx.moveTo(240, 362);
	ctx.lineTo(345, 326);
	ctx.lineTo(450, 362);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = css(VERMONT.signboard);
	ctx.fillRect(262, 376, 34, 40);
	dabs(p, rand, 120, VERMONT.leaves, [0, 640], [330, 470], 7);
	speckle(p, rand, 3000, ['white', 'black'], [0.4, 1.4], [0.02, 0.07]);
	return toTexture(p);
}

/** A travel poster of Cuenca: the New Cathedral's three blue domes against the Andean sky. */
export function cuencaPoster(): THREE.CanvasTexture {
	const p = paint(480, 640);
	const { ctx } = p;
	const sky = ctx.createLinearGradient(0, 0, 0, 480);
	sky.addColorStop(0, css(COLORADO.skyTop));
	sky.addColorStop(1, css(COLORADO.skyHorizon));
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, 480, 640);
	const dome = (x: number, y: number, r: number) => {
		ctx.fillStyle = css(CUENCA.stone);
		ctx.fillRect(x - r * 0.95, y, r * 1.9, r * 0.5);
		ctx.fillStyle = css(CUENCA.domeBlue);
		ctx.beginPath();
		ctx.arc(x, y, r, Math.PI, 0);
		ctx.fill();
		ctx.strokeStyle = css(CUENCA.domeWhite);
		ctx.lineWidth = 3;
		for (let i = 1; i < 6; i++) {
			const a = Math.PI + (i / 6) * Math.PI;
			ctx.beginPath();
			ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
			ctx.quadraticCurveTo(x + Math.cos(a) * r * 0.4, y - r * 0.6, x, y - r);
			ctx.stroke();
		}
		ctx.fillStyle = css(CUENCA.stone);
		ctx.fillRect(x - 6, y - r - 26, 12, 26);
	};
	ctx.fillStyle = css(CUENCA.brick);
	ctx.fillRect(40, 300, 400, 200);
	ctx.fillRect(40, 230, 70, 80);
	ctx.fillRect(370, 230, 70, 80);
	dome(160, 300, 60);
	dome(320, 300, 60);
	dome(240, 260, 100);
	ctx.fillStyle = css(CUENCA.glass);
	ctx.beginPath();
	ctx.arc(240, 400, 30, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = css(CUENCA.ink);
	ctx.fillRect(0, 500, 480, 140);
	ctx.fillStyle = css(CUENCA.domeWhite);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	fitText(ctx, 'CUENCA', (n) => `700 ${n}px ${FONT_DISPLAY}`, 420, 86);
	ctx.fillText('CUENCA', 240, 556);
	ctx.fillStyle = css(CUENCA.yellow);
	ctx.font = `600 26px ${FONT_SANS}`;
	ctx.fillText('ECUADOR · 2,560 M', 240, 612);
	return toTexture(p);
}

/** The label on a jug of Vermont maple syrup. */
export function syrupLabel(): THREE.CanvasTexture {
	const p = paint(256, 256);
	const { ctx } = p;
	ctx.fillStyle = css(VERMONT.trim);
	ctx.fillRect(0, 0, 256, 256);
	ctx.fillStyle = css(VERMONT.barn);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = `700 30px ${FONT_SANS}`;
	ctx.fillText('PURE VERMONT', 128, 40);
	ctx.font = `700 34px ${FONT_HAND}`;
	ctx.fillText('Maple Syrup', 128, 214);
	// A maple leaf: five lobes around a stem.
	ctx.fillStyle = css(VERMONT.leaves[0]);
	ctx.beginPath();
	for (let i = 0; i <= 10; i++) {
		const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
		const r = i % 2 ? 26 : 62;
		ctx.lineTo(128 + Math.cos(a) * r, 126 + Math.sin(a) * r);
	}
	ctx.closePath();
	ctx.fill();
	ctx.fillRect(125, 150, 6, 36);
	return toTexture(p);
}

/** An NREL visitor badge on a lanyard clip. */
export function nrelBadge(): THREE.CanvasTexture {
	const p = paint(160, 240);
	const { ctx } = p;
	ctx.fillStyle = css(NREL.blade);
	ctx.fillRect(0, 0, 160, 240);
	ctx.fillStyle = css(NREL.badge);
	ctx.fillRect(0, 0, 160, 64);
	ctx.fillStyle = css(NREL.blade);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = `700 40px ${FONT_SANS}`;
	ctx.fillText('NREL', 80, 36);
	ctx.fillStyle = css(NREL.grid);
	ctx.fillRect(44, 80, 72, 80);
	ctx.fillStyle = css(NREL.panel);
	ctx.font = `700 24px ${FONT_SANS}`;
	ctx.fillText('VISITOR', 80, 186);
	ctx.font = `600 16px ${FONT_SANS}`;
	ctx.fillText('GOLDEN, CO', 80, 214);
	return toTexture(p);
}

/** A basketball backboard: white, a red border and the red shooter's square. */
export function backboard(): THREE.CanvasTexture {
	const p = paint(360, 210);
	const { ctx } = p;
	ctx.fillStyle = css(DAVIDSON.backboard);
	ctx.fillRect(0, 0, 360, 210);
	ctx.strokeStyle = css(DAVIDSON.red);
	ctx.lineWidth = 12;
	ctx.strokeRect(6, 6, 348, 198);
	ctx.lineWidth = 8;
	ctx.strokeRect(126, 92, 108, 84);
	return toTexture(p);
}
