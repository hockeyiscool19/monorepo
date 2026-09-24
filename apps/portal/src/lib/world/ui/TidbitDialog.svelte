<script lang="ts">
	// A tidbit read up close, like a note picked up in the world: its emblem, the part of the story it belongs to, the
	// title set like a carved name, and its words. The first reading says so, with the count so far; the journal's
	// Tidbits tab keeps the rest. It stays open until closed (no timer), so it can be read at any pace.
	import { tidbitById, tidbitProgress, TOPICS } from '../domain/tidbits';
	import Dialog from './Dialog.svelte';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl, reading }: { ui: WorldUi; ctl: WorldController; reading: { id: string; fresh: boolean } } = $props();

	let tidbit = $derived(tidbitById(reading.id));
	let progress = $derived(tidbitProgress(ui.found));
</script>

{#if tidbit}
	<Dialog labelledby="tidbit-title" onclose={() => ctl.close()} width="sm" variant="paper">
		<article class="tidbit">
			<header class="head">
				<p class="emblem" aria-hidden="true">{tidbit.emblem}</p>
				<div>
					<p class="topic">{TOPICS[tidbit.topic]}</p>
					<h2 id="tidbit-title">{tidbit.title}</h2>
				</div>
			</header>
			<p class="text">{tidbit.text}</p>
			<footer class="foot">
				<p class="count">
					{#if reading.fresh}<span class="badge" data-kind="live">New</span>{/if}
					{progress.found} of {progress.total} tidbits found
				</p>
				<div class="actions">
					<button type="button" class="btn btn-primary" onclick={() => ctl.close()}>Close</button>
					<button type="button" class="btn btn-text" onclick={() => ((ui.journalTab = 'tidbits'), ctl.open('journal'))}>All tidbits</button>
				</div>
			</footer>
		</article>
	</Dialog>
{/if}

<style>
	.tidbit {
		display: grid;
		gap: var(--space-4);
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.emblem {
		margin: 0;
		font-size: var(--text-3xl);
		line-height: 1;
	}
	.topic {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		line-height: var(--leading-tight);
	}
	.text {
		margin: 0;
		max-width: 62ch;
		font-size: var(--text-md);
		line-height: var(--leading-normal);
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border-strong);
	}
	.count {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
</style>
