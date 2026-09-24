// The Jarl's landmarks in the overworld: every site built at its place in the layout, the Heartcell and the legend's
// lectern at the centre of the square, and the Memory Lane signpost by the road in, with a painted arrow pointing
// at each place in the story.

import * as THREE from 'three';
import type { LandmarkId } from '../../../domain/landmarks';
import type { PlacedLandmark, RealmLayout } from '../../../domain/realm';
import { CELL, CUENCA, DAVIDSON, NREL, RINK, TESLA, VERMONT, WOOD } from '../../palette';
import { paintedBoard } from '../../textures/landmarks';
import { buildCuenca } from './cuenca';
import { buildDavidson } from './davidson';
import { buildHeartcell, buildLectern } from './heartcell';
import { Kit, type KitContext, type Site } from './kit';
import { buildNrel } from './nrel';
import { buildRink } from './rink';
import { buildSupercharger } from './tesla';
import { buildVermont } from './vermont';

export type { KitContext, Site } from './kit';

const BUILDERS: Record<LandmarkId, (landmark: PlacedLandmark, ctx: KitContext) => Site> = {
	rink: buildRink,
	supercharger: buildSupercharger,
	vermont: buildVermont,
	cuenca: buildCuenca,
	davidson: buildDavidson,
	nrel: buildNrel
};

/** Each arrow's words and paint. */
const ARROWS: Record<LandmarkId | 'heartcell', { text: string; ground: number; ink: number }> = {
	heartcell: { text: 'THE HEARTCELL', ground: CELL.wrap, ink: CELL.charge },
	rink: { text: 'POND RINK', ground: RINK.boards, ink: RINK.post },
	supercharger: { text: 'SUPERCHARGER', ground: TESLA.stallRed, ink: TESLA.stall },
	vermont: { text: 'VERMONT', ground: VERMONT.bbaGreen, ink: VERMONT.bbaGold },
	cuenca: { text: 'CUENCA, ECUADOR', ground: CUENCA.domeBlue, ink: CUENCA.domeWhite },
	davidson: { text: 'DAVIDSON, N.C.', ground: DAVIDSON.red, ink: DAVIDSON.column },
	nrel: { text: 'NREL · GOLDEN', ground: NREL.badge, ink: NREL.blade }
};

/** Memory Lane: a tall post by the road, an arrow for every landmark and the Heartcell, each pointing the way. */
function memoryLane(layout: RealmLayout, ctx: KitContext): Site {
	const post = layout.memoryLane;
	const kit = new Kit('memory-lane', { x: post.x, z: post.z, yaw: 0 }, ctx);
	const wood = kit.solid(WOOD.logDark, 0.9);
	const tipMat = kit.keep(new THREE.MeshStandardMaterial({ color: WOOD.plankDark, roughness: 0.9, side: THREE.DoubleSide }));
	kit.cyl(0.09, 0.11, 3.9, wood, 0, 1.95, 0, 8);
	const targets: { id: LandmarkId | 'heartcell'; x: number; z: number }[] = [
		{ id: 'heartcell', x: layout.heartcell.x, z: layout.heartcell.z },
		...layout.landmarks.map((l) => ({ id: l.id, x: l.spot.x, z: l.spot.z }))
	];
	const tip = new THREE.Shape([new THREE.Vector2(0, -0.15), new THREE.Vector2(0.26, 0), new THREE.Vector2(0, 0.15)]);
	targets.forEach((target, i) => {
		const angle = Math.atan2(target.x - post.x, target.z - post.z);
		const ry = angle - Math.PI / 2;
		const y = 3.55 - i * 0.4;
		const style = ARROWS[target.id];
		const face = kit.face(paintedBoard([style.text], { ground: style.ground, ink: style.ink, font: 'sans', w: 512, h: 100 }));
		const along = (d: number) => [Math.sin(angle) * d, Math.cos(angle) * d] as const;
		const [bx, bz] = along(0.85);
		kit.box(1.4, 0.3, 0.05, wood, bx, y, bz, ry);
		// Both faces carry the words, so the arrow reads from either side of the road.
		for (const side of [1, -1]) {
			const off = 0.03 * side;
			kit.piece(new THREE.PlaneGeometry(1.36, 0.27), face, bx + Math.sin(ry) * off, y, bz + Math.cos(ry) * off, 0, ry + (side > 0 ? 0 : Math.PI), 0);
		}
		const [tx, tz] = along(1.55);
		kit.piece(new THREE.ShapeGeometry(tip), tipMat, tx, y, tz, 0, ry, 0);
	});
	// Its name on top, turned to the traveller arriving at the spawn.
	const toSpawn = Math.atan2(layout.spawn.x - post.x, layout.spawn.z - post.z);
	const title = paintedBoard(['Memory Lane'], { ground: WOOD.plank, ink: WOOD.logDark, font: 'hand', w: 512, h: 128 });
	kit.box(1.16, 0.32, 0.05, wood, 0, 4.02, 0, toSpawn);
	kit.plane(1.1, 0.28, kit.face(title), Math.sin(toSpawn) * 0.03, 4.02, Math.cos(toSpawn) * 0.03, toSpawn + Math.PI);
	kit.pillar(0, 0, 0.3);
	kit.tidbit('memory-lane', 0, 0, 2.2, 2.8);
	return kit.build();
}

export function buildLandmarks(layout: RealmLayout, ctx: KitContext): Site {
	const sites: Site[] = [buildHeartcell(layout, ctx), buildLectern(layout, ctx), memoryLane(layout, ctx)];
	for (const landmark of layout.landmarks) sites.push(BUILDERS[landmark.id](landmark, ctx));
	const group = new THREE.Group();
	group.name = 'landmarks';
	for (const site of sites) group.add(site.group);
	return {
		group,
		colliders: sites.flatMap((s) => s.colliders),
		interactables: sites.flatMap((s) => s.interactables),
		update(t) {
			for (const site of sites) site.update(t);
		},
		dispose() {
			for (const site of sites) site.dispose();
		}
	};
}
