<script lang="ts">
	// The compass bar across the top of the screen: cardinal points and a marker for every gate and landmark,
	// sliding as you turn. Screen readers get the heading and the nearest landmark in words instead.
	import type { HudMarker } from '../engine/Engine';

	let { heading, markers }: { heading: number; markers: HudMarker[] } = $props();

	const FIELD = 80;
	const POINTS = [
		{ label: 'N', deg: 0, major: true },
		{ label: 'NE', deg: 45, major: false },
		{ label: 'E', deg: 90, major: true },
		{ label: 'SE', deg: 135, major: false },
		{ label: 'S', deg: 180, major: true },
		{ label: 'SW', deg: 225, major: false },
		{ label: 'W', deg: 270, major: true },
		{ label: 'NW', deg: 315, major: false }
	];
	const NAMES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

	const delta = (deg: number) => ((((deg - heading) % 360) + 540) % 360) - 180;
	const place = (deg: number) => 50 + (delta(deg) / FIELD) * 50;

	let points = $derived(POINTS.filter((p) => Math.abs(delta(p.deg)) <= FIELD).map((p) => ({ ...p, x: place(p.deg) })));
	let shown = $derived(
		markers
			.filter((m) => Math.abs(delta(m.bearing)) <= FIELD)
			.map((m) => ({ ...m, x: place(m.bearing), near: m.distance < 30 }))
	);
	let label = $derived.by(() => {
		const dir = NAMES[Math.round(heading / 45) % 8];
		const ahead = shown.slice().sort((a, b) => Math.abs(delta(a.bearing)) - Math.abs(delta(b.bearing)))[0];
		return `Facing ${dir}${ahead ? `; ahead: ${ahead.label}, ${Math.round(ahead.distance)} metres` : ''}`;
	});
</script>

<div class="compass" role="img" aria-label={label}>
	<div class="rule" aria-hidden="true"></div>
	{#each points as p (p.label)}
		<span class="point" class:major={p.major} style:left="{p.x}%" aria-hidden="true">{p.label}</span>
	{/each}
	{#each shown as m (m.id)}
		<span class="marker" class:near={m.near} style:left="{m.x}%" aria-hidden="true" title={m.label}>{m.icon}</span>
	{/each}
	<span class="tick" aria-hidden="true"></span>
</div>

<style>
	.compass {
		position: relative;
		width: min(100%, calc(var(--content-max) * 0.46));
		height: var(--space-7);
		margin-inline: auto;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-bg) 70%, transparent);
		border-block: 1px solid var(--color-border-strong);
		mask-image: linear-gradient(90deg, transparent, black 12%, black 88%, transparent);
	}
	.rule {
		position: absolute;
		inset-inline: 0;
		top: 50%;
		border-top: 1px solid var(--color-border);
	}
	.point,
	.marker {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		line-height: 1;
		white-space: nowrap;
	}
	.point {
		font-family: var(--font-display);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}
	.point.major {
		font-size: var(--text-md);
		font-weight: var(--weight-bold);
		color: var(--color-text);
	}
	.marker {
		font-size: var(--text-md);
		opacity: 0.8;
		filter: drop-shadow(0 0 2px var(--color-bg));
	}
	.marker.near {
		opacity: 1;
		font-size: var(--text-lg);
	}
	.tick {
		position: absolute;
		left: 50%;
		bottom: 0;
		border-inline: var(--space-1) solid transparent;
		border-bottom: var(--space-1) solid var(--color-accent);
		transform: translateX(-50%);
	}
</style>
