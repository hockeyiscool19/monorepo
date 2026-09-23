// Ground-plane collision for a walking player. One primitive: a capsule seen from above — a segment
// with a radius. A pillar is a zero-length segment, a wall is a long thin one. Pure math, no three.js.

export interface Capsule {
	ax: number;
	az: number;
	bx: number;
	bz: number;
	r: number;
	/** Optional tag so a collider can be switched off (e.g. a gate's ward once it opens). */
	tag?: string;
}

export function pillar(x: number, z: number, r: number, tag?: string): Capsule {
	return { ax: x, az: z, bx: x, bz: z, r, tag };
}

export function wall(ax: number, az: number, bx: number, bz: number, r = 0.1, tag?: string): Capsule {
	return { ax, az, bx, bz, r, tag };
}

/** Four walls around an axis-aligned rectangle centred on (cx, cz), turned by `yaw` about its centre. */
export function box(cx: number, cz: number, width: number, depth: number, yaw = 0, tag?: string): Capsule[] {
	const hw = width / 2;
	const hd = depth / 2;
	const c = Math.cos(yaw);
	const s = Math.sin(yaw);
	// Local (u, v) → world: x = cx + u·c + v·s, z = cz − u·s + v·c (a rotation by yaw about +y).
	const p = (u: number, v: number): [number, number] => [cx + u * c + v * s, cz - u * s + v * c];
	const corners = [p(-hw, -hd), p(hw, -hd), p(hw, hd), p(-hw, hd)];
	return corners.map(([ax, az], i) => {
		const [bx, bz] = corners[(i + 1) % 4];
		return { ax, az, bx, bz, r: 0.05, tag };
	});
}

/** Closest point on the segment a→b to (x, z). */
export function closestOnSegment(c: Capsule, x: number, z: number): [number, number] {
	const dx = c.bx - c.ax;
	const dz = c.bz - c.az;
	const len2 = dx * dx + dz * dz;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - c.ax) * dx + (z - c.az) * dz) / len2));
	return [c.ax + t * dx, c.az + t * dz];
}

/**
 * Push a circle of `radius` at (x, z) out of every capsule, then back inside `boundary` (a circle around the
 * origin, when given). A few passes settle corners where two colliders meet.
 */
export function resolve(
	x: number,
	z: number,
	radius: number,
	colliders: readonly Capsule[],
	boundary?: { radius: number; cx?: number; cz?: number },
	disabled?: ReadonlySet<string>
): [number, number] {
	let px = x;
	let pz = z;
	for (let pass = 0; pass < 3; pass++) {
		let moved = false;
		for (const c of colliders) {
			if (c.tag && disabled?.has(c.tag)) continue;
			const [qx, qz] = closestOnSegment(c, px, pz);
			let nx = px - qx;
			let nz = pz - qz;
			const min = c.r + radius;
			const d2 = nx * nx + nz * nz;
			if (d2 >= min * min) continue;
			const d = Math.sqrt(d2);
			if (d < 1e-6) {
				// Exactly on the segment: push perpendicular to it.
				const sx = c.bx - c.ax;
				const sz = c.bz - c.az;
				const sl = Math.hypot(sx, sz) || 1;
				nx = -sz / sl;
				nz = sx / sl;
				px = qx + nx * min;
				pz = qz + nz * min;
			} else {
				px = qx + (nx / d) * min;
				pz = qz + (nz / d) * min;
			}
			moved = true;
		}
		if (!moved) break;
	}
	if (boundary) {
		const cx = boundary.cx ?? 0;
		const cz = boundary.cz ?? 0;
		const dx = px - cx;
		const dz = pz - cz;
		const d = Math.hypot(dx, dz);
		const max = boundary.radius - radius;
		if (d > max) {
			px = cx + (dx / d) * max;
			pz = cz + (dz / d) * max;
		}
	}
	return [px, pz];
}

/** True when the step from (x0, z0) to (x1, z1) crosses the segment a→b (used for walking through portals). */
export function crosses(c: Capsule, x0: number, z0: number, x1: number, z1: number): boolean {
	const side = (px: number, pz: number) => (c.bx - c.ax) * (pz - c.az) - (c.bz - c.az) * (px - c.ax);
	const s0 = side(x0, z0);
	const s1 = side(x1, z1);
	if (s0 === 0 || s1 === 0 || s0 > 0 === s1 > 0) return false;
	const t0 = (x1 - x0) * (c.az - z0) - (z1 - z0) * (c.ax - x0);
	const t1 = (x1 - x0) * (c.bz - z0) - (z1 - z0) * (c.bx - x0);
	return t0 > 0 !== t1 > 0;
}
