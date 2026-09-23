<script lang="ts">
	// A finished project evolves, the way a creature does in the handheld games: "What? GET-3 is evolving!",
	// the note and its evolved form trade silhouettes faster and faster, a golden burst, then the new form, a
	// fanfare and EXP filling the bar. Safe by design: the silhouettes swap shape, not brightness, never more
	// than three times a second (WCAG 2.3.1); reduced motion skips straight to the result; Skip and Continue
	// are real buttons, and every line is announced once.
	import '@fontsource/press-start-2p/400.css';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { EVOLVES_INTO, expFor, levelFor, levelProgress, TYPE_LABELS } from '../domain/board';
	import Dialog from './Dialog.svelte';
	import type { WorldController } from './controller';
	import { prefersReducedMotion, type Evolution, type WorldUi } from './state.svelte';

	let { ui, ctl, evolution }: { ui: WorldUi; ctl: WorldController; evolution: Evolution } = $props();

	type Phase = 'intro' | 'evolving' | 'burst' | 'evolved' | 'exp' | 'levelup';
	// One evolution per mount: take a snapshot of the card, the EXP and the settings (deliberately not reactive).
	const { card, expBefore, expAfter } = untrack(() => evolution);
	const form = EVOLVES_INTO[card.type];
	const who = untrack(() => (ui.viewer?.name?.split(/\s+/)[0] ?? 'You').toUpperCase());
	const gained = expFor(card);
	const levelBefore = levelFor(expBefore);
	const levelAfter = levelFor(expAfter);
	const reduced = untrack(() => prefersReducedMotion(ui.settings));

	let phase = $state<Phase>(reduced ? 'evolved' : 'intro');
	let showAfter = $state(false);
	let typed = $state('');
	let bar = $state(levelProgress(expBefore).fraction);
	let continueButton: HTMLButtonElement | undefined = $state();
	const timers: ReturnType<typeof setTimeout>[] = [];
	const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

	let line = $derived(
		phase === 'intro' || phase === 'evolving'
			? `What? ${card.key} is evolving!`
			: phase === 'burst'
				? '…'
				: phase === 'evolved'
					? `Congratulations! Your ${card.key} evolved into ${form.toUpperCase()}!`
					: phase === 'exp'
						? `${who} gained ${gained} EXP. Points!`
						: `${who} grew to Lv. ${levelAfter}!`
	);

	// Typewriter for each new line (instant under reduced motion).
	$effect(() => {
		const text = line;
		if (reduced) {
			typed = text;
			return;
		}
		typed = '';
		let i = 0;
		const timer = setInterval(() => {
			i += 1;
			typed = text.slice(0, i);
			if (i >= text.length) clearInterval(timer);
		}, 28);
		return () => clearInterval(timer);
	});

	function evolve() {
		phase = 'evolving';
		ctl.audio?.shimmer(3.6);
		// Swap intervals shrink from 620 ms to 340 ms: at most ~3 swaps per second, never a flash.
		let at = 0;
		for (const gap of [620, 560, 500, 460, 420, 390, 360, 340, 340, 340]) {
			at += gap;
			later(at, () => (showAfter = !showAfter));
		}
		later(at + 200, () => {
			phase = 'burst';
			showAfter = true;
		});
		later(at + 900, arrive);
	}

	function arrive() {
		phase = 'evolved';
		showAfter = true;
		ctl.audio?.fanfare();
		queueMicrotask(() => continueButton?.focus());
	}

	function fillExp() {
		phase = 'exp';
		const target = levelAfter > levelBefore ? 1 : levelProgress(expAfter).fraction;
		if (reduced) bar = target;
		else later(80, () => (bar = target));
	}

	function next() {
		if (phase === 'intro' || phase === 'evolving' || phase === 'burst') {
			for (const t of timers) clearTimeout(t);
			return arrive();
		}
		if (phase === 'evolved') return fillExp();
		if (phase === 'exp' && levelAfter > levelBefore) {
			phase = 'levelup';
			bar = levelProgress(expAfter).fraction;
			ctl.audio?.fanfare();
			return;
		}
		ctl.board.finishEvolution();
	}

	onMount(() => {
		if (reduced) {
			showAfter = true;
			ctl.audio?.fanfare();
			queueMicrotask(() => continueButton?.focus());
		} else later(1500, evolve);
	});
	onDestroy(() => timers.forEach(clearTimeout));
</script>

<Dialog labelledby="evolution-line" onclose={() => ctl.board.finishEvolution()} variant="bare" width="full">
	<div class="stage" data-phase={phase} data-reduced={reduced}>
		<div class="rays" aria-hidden="true"></div>
		<div class="subject" aria-hidden="true">
			<div class="note" data-type={card.type} class:silhouette={phase === 'evolving' || phase === 'intro'} class:hidden={showAfter}>
				<span class="key">{card.key}</span>
				<span class="title">{card.title}</span>
				<span class="kind">{TYPE_LABELS[card.type]}</span>
			</div>
			<div class="form" class:silhouette={phase === 'evolving'} class:hidden={!showAfter}>
				<span class="star">★</span>
				<span class="form-name">{form}</span>
				<span class="kind">{card.key} · {card.title}</span>
			</div>
		</div>
		{#if phase === 'burst'}<div class="burst" aria-hidden="true"></div>{/if}

		<div class="textbox">
			<p id="evolution-line" class="line" aria-hidden="true">{typed}<span class="caret">▼</span></p>
			<p class="visually-hidden" role="status">{line}</p>
			{#if phase === 'exp' || phase === 'levelup'}
				<div class="exp">
					<span class="lv">Lv{phase === 'levelup' ? levelAfter : levelBefore}</span>
					<span class="exp-label" aria-hidden="true">EXP</span>
					<div class="bar" role="meter" aria-label="Experience" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(bar * 100)}>
						<span style:width="{bar * 100}%"></span>
					</div>
				</div>
			{/if}
			<div class="buttons">
				{#if phase === 'intro' || phase === 'evolving' || phase === 'burst'}
					<button type="button" class="pixel" onclick={next}>Skip</button>
				{:else}
					<button bind:this={continueButton} type="button" class="pixel" onclick={next}>
						{phase === 'levelup' || (phase === 'exp' && levelAfter === levelBefore) ? 'Done' : 'Continue'}
					</button>
				{/if}
			</div>
		</div>
	</div>
</Dialog>

<style>
	/* The evolution happens in the dark, as in the games: in the light theme the stage is dark ink, in the dark
	   theme it is the night ground. White silhouettes and gold rays read on both. */
	.stage {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-rows: 1fr auto;
		overflow: hidden;
		color: var(--color-text);
		background: radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--color-text) 78%, var(--color-accent)), var(--color-text) 72%);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .stage {
			background: radial-gradient(circle at 50% 42%, var(--color-surface), var(--color-bg) 70%);
		}
	}
	:global(:root[data-theme='dark']) .stage {
		background: radial-gradient(circle at 50% 42%, var(--color-surface), var(--color-bg) 70%);
	}
	.rays {
		position: absolute;
		inset: -50%;
		background: repeating-conic-gradient(from 0deg at 50% 50%, color-mix(in srgb, var(--color-accent) 30%, transparent) 0deg 8deg, transparent 8deg 22deg);
		opacity: 0;
		transition: opacity var(--duration-slow) var(--ease-standard);
	}
	.stage[data-phase='evolving'] .rays,
	.stage[data-phase='burst'] .rays {
		opacity: 1;
		animation: spin calc(var(--duration-slow) * 20) linear infinite;
	}
	.stage[data-phase='evolved'] .rays,
	.stage[data-phase='exp'] .rays,
	.stage[data-phase='levelup'] .rays {
		opacity: 0.45;
	}
	.subject {
		position: relative;
		display: grid;
		place-items: center;
	}
	.note,
	.form {
		grid-area: 1 / 1;
		display: grid;
		gap: var(--space-2);
		justify-items: center;
		width: min(70vw, calc(var(--space-8) * 4.5));
		padding: var(--space-5);
		text-align: center;
		box-shadow: var(--shadow-lg);
		transition: transform var(--duration-base) var(--ease-emphasized), opacity var(--duration-base) var(--ease-standard);
	}
	.note {
		background: var(--color-warning-soft);
		transform: rotate(-3deg);
	}
	.note[data-type='feature'] {
		background: var(--color-info-soft);
	}
	.note[data-type='fix'] {
		background: var(--color-danger-soft);
	}
	.note[data-type='chore'] {
		background: var(--color-success-soft);
	}
	.form {
		background: var(--color-accent-soft);
		color: var(--color-on-accent-soft);
		border: var(--space-1) double var(--color-accent);
		border-radius: var(--radius-lg);
	}
	.stage[data-phase='evolved'] .form,
	.stage[data-phase='exp'] .form,
	.stage[data-phase='levelup'] .form {
		transform: scale(1.08);
	}
	.silhouette {
		filter: brightness(0) invert(1) drop-shadow(0 0 var(--space-4) var(--color-accent));
	}
	.hidden {
		opacity: 0;
		transform: scale(0.9);
	}
	.key,
	.kind {
		font-family: 'Press Start 2P', var(--font-mono);
		font-size: var(--text-xs);
	}
	.title {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		overflow-wrap: anywhere;
	}
	.star {
		font-size: calc(var(--text-3xl) * 1.6);
		line-height: 1;
		color: var(--color-accent);
	}
	.form-name {
		font-family: 'Press Start 2P', var(--font-mono);
		font-size: var(--text-lg);
		text-transform: uppercase;
	}
	.burst {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at 50% 42%, var(--color-accent), transparent 60%);
		animation: burst var(--duration-slow) var(--ease-emphasized) both;
	}
	.textbox {
		position: relative;
		display: grid;
		gap: var(--space-3);
		margin: var(--space-4);
		padding: var(--space-4) var(--space-5);
		font-family: 'Press Start 2P', var(--font-mono);
		font-size: var(--text-sm);
		line-height: 1.9;
		color: var(--color-text);
		background: var(--color-bg-elevated);
		border: var(--space-1) double var(--color-border-strong);
		border-radius: var(--radius-md);
	}
	.line {
		min-height: 3.8em;
		margin: 0;
	}
	.caret {
		margin-left: var(--space-2);
		color: var(--color-accent);
		animation: blink calc(var(--duration-slow) * 2) steps(1) 6;
	}
	.exp {
		display: grid;
		grid-template-columns: auto auto 1fr;
		gap: var(--space-3);
		align-items: center;
	}
	.exp-label {
		font-size: var(--text-xs);
		color: var(--color-info);
	}
	.bar {
		height: var(--space-3);
		background: var(--color-surface-hover);
		border: 2px solid var(--color-border-strong);
		border-radius: var(--radius-full);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--color-info);
		transition: width calc(var(--duration-slow) * 3) var(--ease-standard);
	}
	.buttons {
		display: flex;
		justify-content: flex-end;
	}
	.pixel {
		min-height: var(--control-height);
		padding: 0 var(--space-4);
		font: inherit;
		font-size: var(--text-xs);
		color: var(--color-on-accent);
		background: var(--color-accent);
		border: 0;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.pixel:hover {
		background: var(--color-accent-hover);
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}
	@keyframes burst {
		from {
			opacity: 0;
			transform: scale(0.4);
		}
		40% {
			opacity: 0.85;
		}
		to {
			opacity: 0;
			transform: scale(1.6);
		}
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rays,
		.caret {
			animation: none !important;
		}
	}
</style>
