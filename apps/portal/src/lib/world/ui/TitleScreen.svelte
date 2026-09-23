<script lang="ts">
	// The title screen: EISENHOLD in carved capitals over drifting aurora light, and three ways in — walk the
	// realm, read the gates as a list, or open the classic tiles. Any key begins, like the game it echoes.
	import { onMount } from 'svelte';
	import type { RealmMode } from '../domain/access';

	let {
		mode,
		gateCount,
		classicHref,
		onbegin,
		onlist
	}: { mode: RealmMode; gateCount: number; classicHref: string; onbegin: () => void; onlist: () => void } = $props();

	let begin: HTMLButtonElement | undefined = $state();

	onMount(() => begin?.focus());

	function anyKey(event: KeyboardEvent) {
		if (event.key === 'Tab' || event.key === 'Shift' || event.altKey || event.metaKey || event.ctrlKey) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('a, button')) return;
		event.preventDefault();
		onbegin();
	}
</script>

<svelte:window onkeydown={anyKey} />

<section class="title" aria-labelledby="realm-title">
	<div class="aurora" aria-hidden="true"></div>
	<div class="content">
		<p class="eyebrow">eisensoftware</p>
		<h1 id="realm-title">Eisenhold</h1>
		<p class="lede">
			A hold of {gateCount} gates. Each one opens onto an app I build; walk up to it and step through.
		</p>
		<p class="realm" data-mode={mode}>
			{#if mode === 'open'}
				Local realm — every gate and room stands open.
			{:else}
				Guarded realm — warded gates ask who you are.
			{/if}
		</p>
		<div class="actions">
			<button bind:this={begin} type="button" class="btn btn-primary" onclick={onbegin}>Begin the journey</button>
			<button type="button" class="btn btn-secondary" onclick={onlist}>List every gate</button>
			<a class="btn btn-text" href={classicHref}>Classic view</a>
		</div>
		<p class="press" aria-hidden="true">Press any key</p>
	</div>
</section>

<style>
	.title {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: var(--space-5) var(--gutter);
		overflow: hidden;
		background: radial-gradient(ellipse at 50% 120%, var(--color-surface), var(--color-bg) 70%);
		color: var(--color-text);
		text-align: center;
	}
	.aurora {
		position: absolute;
		inset: -20% -10% 40%;
		background:
			radial-gradient(ellipse at 30% 60%, color-mix(in srgb, var(--color-success) 38%, transparent), transparent 60%),
			radial-gradient(ellipse at 70% 40%, color-mix(in srgb, var(--color-info) 34%, transparent), transparent 55%),
			radial-gradient(ellipse at 55% 70%, color-mix(in srgb, var(--color-accent) 18%, transparent), transparent 60%);
		filter: blur(var(--space-6));
		opacity: 0.8;
		/* Finite (under five seconds) so nothing moves on its own for long: WCAG 2.2.2. */
		animation: drift calc(var(--duration-slow) * 12) var(--ease-standard) 1 both;
	}
	.content {
		position: relative;
		display: grid;
		gap: var(--space-4);
		justify-items: center;
		max-width: calc(var(--content-max) * 0.62);
	}
	.eyebrow {
		margin: 0;
		font-size: var(--text-sm);
		letter-spacing: 0.4em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(var(--text-3xl), 9vw, calc(var(--text-3xl) * 2));
		font-weight: var(--weight-bold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		line-height: var(--leading-tight);
		text-shadow: 0 0 var(--space-6) color-mix(in srgb, var(--color-accent) 45%, transparent);
	}
	.lede {
		margin: 0;
		font-size: var(--text-lg);
		line-height: var(--leading-normal);
	}
	.realm {
		margin: 0;
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-sm);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-full);
	}
	.realm[data-mode='open'] {
		background: var(--color-success-soft);
	}
	.realm[data-mode='guarded'] {
		background: var(--color-warning-soft);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		justify-content: center;
	}
	.press {
		margin: var(--space-4) 0 0;
		font-size: var(--text-xs);
		letter-spacing: 0.35em;
		text-transform: uppercase;
		color: var(--color-text-muted);
		animation: pulse calc(var(--duration-slow) * 3) var(--ease-standard) 2 alternate;
	}
	@keyframes drift {
		to {
			transform: translate3d(4%, 3%, 0) scale(1.08);
		}
	}
	@keyframes pulse {
		from {
			opacity: 0.45;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.aurora,
		.press {
			animation: none;
		}
	}
</style>
