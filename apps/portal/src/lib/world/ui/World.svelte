<script lang="ts">
	// Eisenhold, the page: a focusable world surface with the 3D canvas, the HUD over it, and one overlay at a
	// time. Server-rendered underneath is a plain directory of every gate — the skip link's target, the no-JS
	// fallback, and a path for anyone who would rather not walk.
	import { onMount } from 'svelte';
	import type { RealmData } from '../domain/realm';
	import CorkBoard from './CorkBoard.svelte';
	import DrawingBoard from './DrawingBoard.svelte';
	import Evolution from './Evolution.svelte';
	import Hud from './Hud.svelte';
	import JournalMenu from './JournalMenu.svelte';
	import LoadingScreen from './LoadingScreen.svelte';
	import MapMenu from './MapMenu.svelte';
	import NoticeDialog from './NoticeDialog.svelte';
	import PauseMenu from './PauseMenu.svelte';
	import TidbitDialog from './TidbitDialog.svelte';
	import TitleScreen from './TitleScreen.svelte';
	import WordWallPanel from './WordWallPanel.svelte';
	import { WorldController } from './controller';
	import { WorldUi } from './state.svelte';

	let { realm }: { realm: RealmData } = $props();

	const ui = new WorldUi();
	let ctl = $state<WorldController | null>(null);
	let canvas: HTMLCanvasElement | undefined = $state();
	let surface: HTMLDivElement | undefined = $state();
	let coarse = $state(false);

	onMount(() => {
		const controller = new WorldController(realm, ui, window.location);
		ctl = controller;
		coarse = matchMedia('(pointer: coarse)').matches;
		void controller.init();
		return () => controller.dispose();
	});

	function begin() {
		if (ctl && canvas && surface && ui.phase === 'title') void ctl.begin(canvas, surface);
	}

	function look() {
		if (ui.phase === 'playing' && ui.overlay === null) ctl?.requestPointerLock();
	}

	// Menus closed: give the keyboard back to the world.
	$effect(() => {
		if (ui.overlay === null && ui.phase === 'playing') surface?.focus();
	});
</script>

<svelte:head>
	<title>Eisenhold · eisensoftware</title>
	<meta name="description" content="Walk a snowbound hold and step through a gate to each app on {realm.domain}." />
</svelte:head>

<a class="skip-link" href="#gate-directory">Skip to the list of gates</a>

<div class="world" data-phase={ui.phase}>
	<!-- The world surface takes keys (W A S D, E, M, J, Esc) only while it has focus, so it must be focusable; the
	     engine attaches those listeners. The click only asks for pointer lock (mouse look) — keyboard users turn with
	     the arrow keys instead, so it needs no key equivalent. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
	<div bind:this={surface} class="surface" role="application" tabindex="0" aria-label="Eisenhold, a 3D world" aria-describedby="world-help" onclick={look}>
		<canvas bind:this={canvas}></canvas>
	</div>
	<p id="world-help" class="visually-hidden">
		Use W, A, S and D to walk, the arrow keys to turn, E to use or enter what is in front of you, M for the map with a list of every
		gate, J for the journal, and Escape for the menu.
	</p>

	{#if ui.phase === 'playing' && ctl}
		<Hud {ui} {ctl} {coarse} />
	{/if}

	{#if ui.phase === 'title'}
		<TitleScreen mode={ctl?.mode ?? 'guarded'} gateCount={realm.gates.length} classicHref={realm.classicHref} onbegin={begin} onlist={() => ctl?.open('map')} />
	{:else if ui.phase === 'loading'}
		<LoadingScreen label={ui.loadingLabel} />
	{:else if ui.phase === 'failed'}
		<section class="failed" aria-labelledby="failed-title">
			<h1 id="failed-title">The realm could not be drawn</h1>
			<p>{ui.failure} Every gate is still one click away.</p>
			<p><button type="button" class="btn btn-primary" onclick={() => ctl?.open('map')}>List every gate</button> <a class="btn btn-text" href={realm.classicHref}>Classic view</a></p>
		</section>
	{/if}
	{#if ui.travel}
		<LoadingScreen label={ui.travel.title} tip={ui.travel.tip} />
	{/if}

	{#if ctl}
		{#if ui.overlay === 'map'}
			<MapMenu {ui} {ctl} worldReady={ui.phase === 'playing'} />
		{:else if ui.overlay === 'journal'}
			<JournalMenu {ui} {ctl} />
		{:else if ui.overlay === 'pause'}
			<PauseMenu {ui} {ctl} />
		{:else if ui.overlay === 'drawing'}
			<DrawingBoard {ui} {ctl} />
		{:else if ui.overlay === 'cork'}
			<CorkBoard {ui} {ctl} />
		{:else if ui.overlay === 'wordwall'}
			<WordWallPanel {ui} {ctl} />
		{:else if ui.overlay === 'notice' && ui.notice}
			<NoticeDialog {ui} {ctl} notice={ui.notice} />
		{:else if ui.overlay === 'evolution' && ui.evolving}
			<Evolution {ui} {ctl} evolution={ui.evolving} />
		{:else if ui.overlay === 'tidbit' && ui.reading}
			<TidbitDialog {ui} {ctl} reading={ui.reading} />
		{/if}
	{/if}

	<p class="visually-hidden" aria-live="polite">{ui.announcement}</p>
</div>

<nav id="gate-directory" class="directory" aria-labelledby="directory-title" tabindex="-1">
	<h2 id="directory-title">Gates of Eisenhold</h2>
	<ul role="list">
		{#each realm.gates as gate (gate.id)}
			<li>
				{#if gate.href}
					<!-- rel="external": app paths are served by Hosting rewrites, not by this app. -->
					<a href={gate.href} rel="external">{gate.icon} {gate.name}</a>
				{:else}
					<span>{gate.icon} {gate.name} (not built yet)</span>
				{/if}
				— {gate.description}{gate.access ? ' Members only: sign in on the way.' : ''}
			</li>
		{/each}
	</ul>
	<p><a href={realm.classicHref}>Classic view with deployments</a></p>
</nav>

<noscript>
	<style>
		.world {
			display: none;
		}
		.directory {
			position: static !important;
			clip-path: none !important;
			width: auto !important;
			height: auto !important;
		}
	</style>
</noscript>

<style>
	.world {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: var(--color-bg);
	}
	.surface {
		position: absolute;
		inset: 0;
		outline-offset: calc(-1 * var(--space-1));
		touch-action: none;
		cursor: crosshair;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	.failed {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		gap: var(--space-3);
		padding: var(--gutter);
		text-align: center;
	}
	.failed h1 {
		margin: 0;
		font-family: var(--font-display);
	}
	.visually-hidden,
	.directory:not(:focus-within) {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.directory {
		position: fixed;
		inset: var(--space-4);
		z-index: 2;
		overflow: auto;
		padding: var(--space-5);
		color: var(--color-text);
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-border-strong);
	}
	.directory ul {
		display: grid;
		gap: var(--space-2);
		padding-left: var(--space-5);
	}
</style>
