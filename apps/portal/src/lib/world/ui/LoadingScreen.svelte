<script lang="ts">
	// Between places: a slowly turning rune seal, a line of lore at the foot of the screen, and what is
	// loading in the corner — the loading screen of the game this realm borrows its manners from.
	import { onMount } from 'svelte';
	import { LOADING_TIPS } from '../domain/lore';

	let { label, tip = '' }: { label: string; tip?: string } = $props();

	let index = $state(0);
	let shownTip = $derived(tip || LOADING_TIPS[index % LOADING_TIPS.length]);

	onMount(() => {
		index = Math.floor(Math.random() * LOADING_TIPS.length);
		const timer = setInterval(() => (index += 1), 7000);
		return () => clearInterval(timer);
	});
</script>

<section class="loading" aria-labelledby="loading-label">
	<svg class="seal" viewBox="-60 -60 120 120" aria-hidden="true">
		<circle r="54" />
		<circle r="44" />
		{#each Array.from({ length: 12 }, (_, i) => i) as i (i)}
			<path d="M0 -50 L4 -42 L0 -38 L-4 -42 Z" transform="rotate({i * 30})" />
		{/each}
		<path class="gate" d="M-16 26 V-6 Q0 -30 16 -6 V26 M-9 26 V-4 Q0 -18 9 -4 V26" />
	</svg>
	<p class="tip">{shownTip}</p>
	<p id="loading-label" class="label" role="status">{label}</p>
</section>

<style>
	.loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: var(--space-6) var(--gutter);
		background: var(--color-bg);
		color: var(--color-text);
	}
	.seal {
		width: calc(var(--space-8) * 2.5);
		height: calc(var(--space-8) * 2.5);
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 1.5;
		animation: turn calc(var(--duration-slow) * 50) linear infinite;
	}
	.seal .gate {
		stroke-width: 2.5;
	}
	.tip {
		position: absolute;
		left: var(--gutter);
		right: var(--gutter);
		bottom: var(--space-7);
		max-width: calc(var(--content-max) * 0.6);
		margin: 0 auto;
		text-align: center;
		font-size: var(--text-md);
		line-height: var(--leading-normal);
		color: var(--color-text);
	}
	.label {
		position: absolute;
		right: var(--gutter);
		bottom: var(--space-4);
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-sm);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	@keyframes turn {
		to {
			transform: rotate(1turn);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.seal {
			animation: none;
		}
	}
</style>
