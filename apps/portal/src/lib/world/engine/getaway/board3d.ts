// The drawing board and the cork board as objects in the room. The cork board shows every card as a sticky
// note pinned under its column's index card; the drafting table's sheet shows the newest idea. Both redraw
// whenever the board changes.

import * as THREE from 'three';
import { column, STATUSES, STATUS_LABELS, type Card } from '../../domain/board';
import { rng } from '../noise';
import { GETAWAY, STICKY, STONE } from '../palette';
import { cork, draftingSheet, indexCard, sticky } from '../textures/room';

export const CORK = { width: 2.5, height: 1.34, y: 1.52 };
const NOTE = 0.25;
const ROWS = 4;

export interface Boards {
	corkGroup: THREE.Group;
	tableGroup: THREE.Group;
	setCards(cards: Card[]): void;
	dispose(): void;
}

export function buildBoards(): Boards {
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
	const frameMat = keep(new THREE.MeshStandardMaterial({ color: GETAWAY.frame, roughness: 0.75 }));

	// Cork board, built facing +z; the room turns it to hang on its wall.
	const corkGroup = new THREE.Group();
	corkGroup.name = 'cork-board';
	const corkMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(CORK.width, CORK.height)), keep(new THREE.MeshStandardMaterial({ map: keep(cork(5)), roughness: 1 })));
	corkMesh.receiveShadow = true;
	corkGroup.add(corkMesh);
	const edge = 0.07;
	for (const [w, h, x, y] of [
		[CORK.width + edge * 2, edge, 0, CORK.height / 2 + edge / 2],
		[CORK.width + edge * 2, edge, 0, -CORK.height / 2 - edge / 2],
		[edge, CORK.height, -CORK.width / 2 - edge / 2, 0],
		[edge, CORK.height, CORK.width / 2 + edge / 2, 0]
	]) {
		const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, 0.06)), frameMat);
		bar.position.set(x, y, 0.01);
		bar.castShadow = true;
		corkGroup.add(bar);
	}
	const colWidth = CORK.width / STATUSES.length;
	STATUSES.forEach((status, i) => {
		const card = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.42, 0.16)), keep(new THREE.MeshStandardMaterial({ map: keep(indexCard(STATUS_LABELS[status].toUpperCase())), roughness: 0.9 })));
		card.position.set(-CORK.width / 2 + colWidth * (i + 0.5), CORK.height / 2 - 0.13, 0.012);
		card.rotation.z = (i % 2 ? 1 : -1) * 0.02;
		corkGroup.add(card);
	});
	const notes = new THREE.Group();
	corkGroup.add(notes);
	const noteGeo = keep(new THREE.PlaneGeometry(NOTE, NOTE));
	const pinGeo = keep(new THREE.SphereGeometry(0.014, 8, 6));
	const pinMats = STICKY.pins.map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.1 })));
	let noteDisposables: { dispose(): void }[] = [];

	// Drafting table: A-frame legs, a tilted board with the sheet, a T-square and a pencil.
	const tableGroup = new THREE.Group();
	tableGroup.name = 'drafting-table';
	const woodMat = keep(new THREE.MeshStandardMaterial({ color: GETAWAY.floor, roughness: 0.7 }));
	for (const side of [-1, 1]) {
		for (const [z, rot] of [[-0.32, 0.18], [0.32, -0.18]] as const) {
			const leg = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.95, 0.05)), woodMat);
			leg.position.set(side * 0.55, 0.47, z);
			leg.rotation.x = rot;
			leg.castShadow = true;
			tableGroup.add(leg);
		}
		const brace = new THREE.Mesh(keep(new THREE.BoxGeometry(0.04, 0.04, 0.72)), woodMat);
		brace.position.set(side * 0.55, 0.3, 0);
		tableGroup.add(brace);
	}
	const tilt = new THREE.Group();
	tilt.position.set(0, 0.98, 0);
	tilt.rotation.x = -0.55;
	tableGroup.add(tilt);
	const board = new THREE.Mesh(keep(new THREE.BoxGeometry(1.3, 0.035, 0.92)), woodMat);
	board.castShadow = true;
	board.receiveShadow = true;
	tilt.add(board);
	const sheetMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.95 }));
	const sheet = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.14, 0.8)), sheetMat);
	// Face up, and turn the sheet so its top edge is the board's high (far) edge: it reads from the low side.
	sheet.rotation.set(-Math.PI / 2, 0, Math.PI);
	sheet.position.y = 0.019;
	sheet.receiveShadow = true;
	tilt.add(sheet);
	// The board tilts down towards local −z, where whoever draws stands; the pencil ledge runs along that edge.
	const ledge = new THREE.Mesh(keep(new THREE.BoxGeometry(1.3, 0.05, 0.04)), woodMat);
	ledge.position.set(0, 0.03, -0.47);
	tilt.add(ledge);
	const tsquare = new THREE.Mesh(keep(new THREE.BoxGeometry(0.9, 0.006, 0.05)), keep(new THREE.MeshStandardMaterial({ color: GETAWAY.paper, roughness: 0.4 })));
	tsquare.position.set(-0.05, 0.025, 0.12);
	tilt.add(tsquare);
	const pencil = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 6)), keep(new THREE.MeshStandardMaterial({ color: STONE.gold, roughness: 0.5 })));
	pencil.rotation.z = Math.PI / 2;
	pencil.position.set(0.3, 0.03, -0.42);
	tilt.add(pencil);
	let sheetTex: THREE.Texture | null = null;

	function setCards(cards: Card[]): void {
		for (const d of noteDisposables) d.dispose();
		noteDisposables = [];
		notes.clear();
		const rand = rng(cards.length + 1);
		STATUSES.forEach((status, i) => {
			const inColumn = column(cards, status);
			const x0 = -CORK.width / 2 + colWidth * (i + 0.5);
			inColumn.slice(0, ROWS).forEach((card, row) => {
				const tex = sticky({ key: card.key, title: card.title, priority: card.priority, type: card.type, done: card.status === 'done' });
				const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
				noteDisposables.push(tex, mat);
				const note = new THREE.Mesh(noteGeo, mat);
				const x = x0 + (row % 2 ? 0.035 : -0.035);
				const y = CORK.height / 2 - 0.37 - row * (NOTE + 0.035);
				note.position.set(x, y, 0.014 + row * 0.001);
				note.rotation.z = (rand() - 0.5) * 0.16;
				note.castShadow = true;
				notes.add(note);
				const pin = new THREE.Mesh(pinGeo, pinMats[(card.number + i) % pinMats.length]);
				pin.position.set(x, y + NOTE / 2 - 0.03, 0.03);
				notes.add(pin);
			});
			const extra = inColumn.length - ROWS;
			if (extra > 0) {
				const tex = indexCard(`+${extra} more`);
				const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
				noteDisposables.push(tex, mat);
				const more = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), mat);
				noteDisposables.push(more.geometry);
				more.position.set(x0, -CORK.height / 2 + 0.08, 0.014);
				notes.add(more);
			}
		});
		const newest = [...cards].filter((c) => c.status !== 'done').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
		sheetTex?.dispose();
		sheetTex = draftingSheet(newest?.title ?? '', cards.length);
		sheetMat.map = sheetTex;
		sheetMat.needsUpdate = true;
	}

	return {
		corkGroup,
		tableGroup,
		setCards,
		dispose() {
			for (const d of noteDisposables) d.dispose();
			sheetTex?.dispose();
			for (const d of disposables) d.dispose();
		}
	};
}
