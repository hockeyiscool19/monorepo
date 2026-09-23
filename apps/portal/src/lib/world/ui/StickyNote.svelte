<script lang="ts">
	// One sticky note on the cork board: key, handwritten title, type, priority, labels, and buttons to move it
	// a column left or right, finish it, or revise it. Dragging is an extra, never the only way (WCAG 2.5.7).
	import '@fontsource/caveat/600.css';
	import { neighbourStatus, PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS, type Card, type Status } from '../domain/board';

	let {
		card,
		tilt,
		onmove,
		onedit
	}: { card: Card; tilt: number; onmove: (card: Card, status: Status) => void; onedit: (card: Card) => void } = $props();

	let prev = $derived(neighbourStatus(card.status, -1));
	let next = $derived(neighbourStatus(card.status, 1));
	const ARROWS = { highest: '⇈', high: '↑', medium: '=', low: '↓', lowest: '⇊' } as const;

	function dragstart(event: DragEvent) {
		event.dataTransfer?.setData('text/plain', card.id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}
</script>

<article class="sticky" data-type={card.type} data-done={card.status === 'done'} style:--x-tilt="{tilt}deg" draggable="true" ondragstart={dragstart} aria-labelledby="sticky-{card.id}">
	<span class="pin" aria-hidden="true"></span>
	<header>
		<span class="key">{card.key}</span>
		<span class="priority" title="{PRIORITY_LABELS[card.priority]} priority"><span aria-hidden="true">{ARROWS[card.priority]}</span><span class="visually-hidden">{PRIORITY_LABELS[card.priority]} priority</span></span>
	</header>
	<h4 id="sticky-{card.id}">{card.title}</h4>
	<p class="meta">{TYPE_LABELS[card.type]}{card.labels.length ? ` · ${card.labels.join(', ')}` : ''}</p>
	{#if card.status === 'done'}<p class="star"><span aria-hidden="true">★</span> Shipped</p>{/if}
	<div class="moves">
		{#if prev}
			<button type="button" onclick={() => onmove(card, prev)} aria-label="Move {card.key} back to {STATUS_LABELS[prev]}"><span aria-hidden="true">←</span></button>
		{/if}
		{#if next}
			<button type="button" onclick={() => onmove(card, next)} aria-label="Move {card.key} to {STATUS_LABELS[next]}">
				<span aria-hidden="true">{next === 'done' ? '✓' : '→'}</span>
			</button>
		{/if}
		<button type="button" onclick={() => onedit(card)} aria-label="Revise {card.key}">Edit</button>
	</div>
</article>

<style>
	.sticky {
		position: relative;
		display: grid;
		gap: var(--space-1);
		padding: var(--space-4) var(--space-3) var(--space-2);
		color: var(--color-text);
		background: var(--color-warning-soft);
		box-shadow: var(--shadow-md);
		transform: rotate(var(--x-tilt));
		transition: transform var(--duration-fast) var(--ease-standard);
		cursor: grab;
	}
	.sticky:hover,
	.sticky:focus-within {
		transform: rotate(0deg) scale(1.02);
	}
	.sticky[data-type='feature'] {
		background: var(--color-info-soft);
	}
	.sticky[data-type='fix'] {
		background: var(--color-danger-soft);
	}
	.sticky[data-type='chore'] {
		background: var(--color-success-soft);
	}
	.pin {
		position: absolute;
		top: var(--space-1);
		left: 50%;
		width: var(--space-3);
		height: var(--space-3);
		transform: translateX(-50%);
		border-radius: var(--radius-full);
		background: var(--color-danger);
		box-shadow: var(--shadow-sm);
	}
	header {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-xs);
		font-weight: var(--weight-bold);
		letter-spacing: 0.04em;
	}
	h4 {
		margin: 0;
		font-family: 'Caveat', var(--font-sans);
		font-size: var(--text-xl);
		font-weight: var(--weight-bold);
		line-height: var(--leading-tight);
		overflow-wrap: anywhere;
	}
	.meta,
	.star {
		margin: 0;
		font-size: var(--text-xs);
	}
	.star {
		font-weight: var(--weight-bold);
	}
	.moves {
		display: flex;
		gap: var(--space-1);
		justify-content: flex-end;
	}
	.moves button {
		min-width: var(--space-6);
		min-height: var(--space-6);
		padding: 0 var(--space-2);
		font: inherit;
		font-size: var(--text-sm);
		color: var(--color-text);
		background: color-mix(in srgb, var(--color-surface) 70%, transparent);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.moves button:hover {
		background: var(--color-surface);
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@media (pointer: coarse) {
		.moves button {
			min-width: var(--control-height);
			min-height: var(--control-height);
		}
	}
</style>
