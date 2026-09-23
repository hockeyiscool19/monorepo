<script lang="ts">
	// The heads-up display over the world: compass, crosshair, the `[E] Enter · Vale Gate` prompt (a real
	// button, so touch and mouse can use it too), stamina, discoveries, subtitles, toasts, and the three menu
	// buttons that mirror M, J and Esc. Nothing here moves on its own under reduced motion.
	import { onMount } from 'svelte';
	import Compass from './Compass.svelte';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl, coarse }: { ui: WorldUi; ctl: WorldController; coarse: boolean } = $props();

	// Touch players get the controls once, for a few seconds, like a game's first-launch tip.
	let touchHint = $state(true);
	onMount(() => {
		const timer = setTimeout(() => (touchHint = false), 9000);
		return () => clearTimeout(timer);
	});

	let prompt = $derived(ui.hud?.target ? ctl.describe(ui.hud.target) : null);
	let inside = $derived(ui.hud?.space === 'getaway');
</script>

<div class="hud" class:inside>
	<header class="top">
		{#if ui.hud}
			<Compass heading={ui.hud.heading} markers={ui.hud.markers} />
		{/if}
		<nav class="menus" aria-label="World menus">
			<button type="button" onclick={() => ctl.open('map')}><span class="key" aria-hidden="true">M</span> Map</button>
			<button type="button" onclick={() => ctl.open('journal')}><span class="key" aria-hidden="true">J</span> Journal</button>
			<button type="button" onclick={() => ctl.open('pause')}><span class="key" aria-hidden="true">Esc</span> Menu</button>
		</nav>
	</header>

	{#if ui.discovery}
		<div class="discovery">
			<p class="discovery-title">{ui.discovery.title}</p>
			<p class="discovery-sub">{ui.discovery.subtitle}</p>
		</div>
	{/if}

	<div class="crosshair" aria-hidden="true"></div>

	<div class="bottom">
		{#if ui.subtitle}
			<p class="subtitle">
				{#if ui.subtitle.speaker}<span class="speaker">{ui.subtitle.speaker}:</span>{/if}
				{ui.subtitle.text}
			</p>
		{/if}
		{#if prompt}
			<button type="button" class="prompt" data-tone={prompt.tone} onclick={() => ctl.interact()}>
				<span class="key" aria-hidden="true">E</span>
				<span class="verb">{prompt.verb}</span>
				<span class="name">{prompt.name}</span>
			</button>
		{:else if !ui.pointerLocked && !coarse}
			<p class="hint">Click the world to look around · <strong>W A S D</strong> walk · <strong>Shift</strong> run · <strong>E</strong> use</p>
		{:else if coarse && touchHint}
			<p class="hint">Drag the <strong>left half</strong> to walk, the <strong>right half</strong> to look · tap a prompt to use it</p>
		{/if}
		{#if ui.hud && ui.hud.stamina < 0.995}
			<div class="stamina" role="meter" aria-label="Stamina" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(ui.hud.stamina * 100)}>
				<span style:width="{ui.hud.stamina * 100}%"></span>
			</div>
		{/if}
	</div>

	<ol class="toasts" aria-label="Messages">
		{#each ui.toasts as toast (toast.id)}
			<li>{toast.text}</li>
		{/each}
	</ol>
</div>

<style>
	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
		display: grid;
		grid-template-rows: auto 1fr auto;
		padding: var(--space-3) var(--gutter);
		font-family: var(--font-sans);
		color: var(--color-text);
	}
	.hud button {
		pointer-events: auto;
	}
	.top {
		grid-row: 1;
		display: grid;
		gap: var(--space-2);
		justify-items: center;
	}
	.menus {
		display: flex;
		gap: var(--space-2);
		justify-self: end;
		position: absolute;
		top: var(--space-3);
		right: var(--gutter);
	}
	.menus button,
	.prompt {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-height);
		padding: 0 var(--space-3);
		font: inherit;
		font-size: var(--text-sm);
		color: var(--color-text);
		background: color-mix(in srgb, var(--color-bg) 78%, transparent);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.menus button:hover,
	.prompt:hover {
		background: color-mix(in srgb, var(--color-surface-hover) 90%, transparent);
	}
	.key {
		display: inline-grid;
		place-items: center;
		min-width: var(--space-5);
		height: var(--space-5);
		padding: 0 var(--space-1);
		font-size: var(--text-xs);
		font-weight: var(--weight-bold);
		color: var(--color-on-accent);
		background: var(--color-accent);
		border-radius: var(--radius-sm);
	}
	.discovery {
		grid-row: 2;
		align-self: start;
		justify-self: center;
		margin-top: var(--space-7);
		padding: var(--space-3) var(--space-6);
		text-align: center;
		background: radial-gradient(closest-side, color-mix(in srgb, var(--color-bg) 70%, transparent), transparent);
		animation: rise var(--duration-slow) var(--ease-emphasized) both;
	}
	.discovery-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.discovery-sub {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	.crosshair {
		position: absolute;
		left: 50%;
		top: 50%;
		width: var(--space-1);
		height: var(--space-1);
		transform: translate(-50%, -50%);
		border-radius: var(--radius-full);
		background: var(--color-text);
		box-shadow: 0 0 0 1px var(--color-bg);
		opacity: 0.8;
	}
	.bottom {
		grid-row: 3;
		align-self: end;
		display: grid;
		justify-items: center;
		align-items: end;
		gap: var(--space-2);
		padding-bottom: var(--space-4);
	}
	.subtitle {
		max-width: calc(var(--content-max) * 0.6);
		margin: 0;
		padding: var(--space-2) var(--space-4);
		text-align: center;
		font-size: var(--text-lg);
		background: color-mix(in srgb, var(--color-bg) 80%, transparent);
		border-radius: var(--radius-sm);
	}
	.speaker {
		font-family: var(--font-display);
		font-weight: var(--weight-bold);
		margin-right: var(--space-2);
	}
	.prompt {
		min-height: calc(var(--control-height) + var(--space-2));
		font-size: var(--text-md);
		border-color: var(--color-accent);
	}
	.prompt .verb {
		font-size: var(--text-sm);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	.prompt .name {
		font-family: var(--font-display);
		font-weight: var(--weight-bold);
	}
	.prompt[data-tone='sealed'] {
		border-color: var(--color-danger);
	}
	.prompt[data-tone='sealed'] .key {
		color: var(--color-text);
		background: var(--color-danger-soft);
	}
	.hint {
		margin: 0;
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-sm);
		color: var(--color-text);
		background: color-mix(in srgb, var(--color-bg) 72%, transparent);
		border-radius: var(--radius-sm);
	}
	.stamina {
		width: min(60%, calc(var(--content-max) * 0.24));
		height: var(--space-1);
		background: color-mix(in srgb, var(--color-bg) 70%, transparent);
		border: 1px solid var(--color-border-strong);
	}
	.stamina span {
		display: block;
		height: 100%;
		background: var(--color-success);
	}
	.toasts {
		position: absolute;
		left: var(--gutter);
		top: calc(var(--space-8) + var(--space-5));
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.toasts li {
		max-width: calc(var(--content-max) * 0.34);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
		background: color-mix(in srgb, var(--color-bg) 82%, transparent);
		border-left: var(--space-1) solid var(--color-accent);
		animation: rise var(--duration-base) var(--ease-standard) both;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(var(--space-2));
		}
	}
	@media (max-width: 599px) {
		.menus {
			position: static;
			justify-self: center;
		}
		.menus button {
			padding: 0 var(--space-2);
		}
		.subtitle {
			font-size: var(--text-md);
		}
	}
</style>
