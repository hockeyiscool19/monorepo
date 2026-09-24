<script lang="ts">
	// The journal's tidbits: every little sign and keepsake of the Jarl's story, by topic. The ones found read in
	// full; the rest give a hint of where to look. Found tidbits are remembered in this browser only.
	import { GETAWAY, spaceState } from '../domain/access';
	import { tidbitProgress, tidbitsByTopic } from '../domain/tidbits';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();

	const groups = tidbitsByTopic();
	let found = $derived(new Set(ui.found));
	let progress = $derived(tidbitProgress(ui.found));
	let roomOpen = $derived(spaceState(GETAWAY, ctl.access).kind === 'open');
</script>

<section class="tidbits" aria-labelledby="tidbits-heading">
	<h3 id="tidbits-heading">Tidbits</h3>
	<p class="lede">Little signs, plaques and keepsakes that tell the Jarl’s story. Walk up to one and press E, or tap the prompt.</p>
	<div class="progress">
		<div class="bar" role="meter" aria-label="Tidbits found" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.found}>
			<span style:width="{(progress.found / progress.total) * 100}%"></span>
		</div>
		<p class="count">
			{progress.found} of {progress.total} found{#if !roomOpen}. {progress.roomTotal} of them are keepsakes inside My Get-a-way, which only the Jarl’s Court may enter.{/if}
		</p>
	</div>
	{#each groups as group (group.topic)}
		<h4>{group.label}</h4>
		<ul role="list">
			{#each group.tidbits as tidbit (tidbit.id)}
				{@const seen = found.has(tidbit.id)}
				<li class:seen>
					<span class="emblem" aria-hidden="true">{seen ? tidbit.emblem : '?'}</span>
					<div>
						<p class="name">{seen ? tidbit.title : 'Not found yet'}</p>
						<p class="body">{seen ? tidbit.text : `Hint: ${tidbit.where}`}</p>
					</div>
				</li>
			{/each}
		</ul>
	{/each}
</section>

<style>
	.tidbits {
		display: grid;
		gap: var(--space-3);
	}
	h3,
	h4 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
	}
	h4 {
		margin-top: var(--space-2);
		font-size: var(--text-md);
	}
	p {
		margin: 0;
	}
	.lede,
	.count {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
	.progress {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.bar {
		height: var(--space-2);
		background: var(--color-surface-hover);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-full);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--color-info);
	}
	ul {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-3);
		align-items: start;
		padding: var(--space-2) var(--space-3);
		border: 1px dashed var(--color-border-strong);
		border-radius: var(--radius-sm);
	}
	li.seen {
		background: var(--color-surface);
		border-style: solid;
		border-color: var(--color-border);
	}
	.emblem {
		display: inline-grid;
		place-items: center;
		width: var(--space-6);
		height: var(--space-6);
		font-size: var(--text-lg);
		color: var(--color-text-muted);
	}
	.name {
		font-weight: var(--weight-medium);
	}
	.body {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
	li.seen .body {
		color: var(--color-text);
	}
</style>
