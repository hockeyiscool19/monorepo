<script lang="ts">
	// The cork board, close up: four columns — Ideas, To Do, In Progress, Done — of sticky notes. Move a note
	// with its arrow buttons or drag it to another column; moving one into Done makes it evolve.
	import { column, STATUSES, STATUS_LABELS, type Card, type Status } from '../domain/board';
	import Dialog from './Dialog.svelte';
	import StickyNote from './StickyNote.svelte';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();

	let over = $state<Status | null>(null);
	const tilt = (card: Card) => ((card.number * 37) % 7) - 3;

	async function move(card: Card, status: Status) {
		try {
			await ctl.board.move(card, status);
		} catch (e) {
			ui.toast(e instanceof Error ? e.message : 'The note would not move.');
		}
	}

	function drop(event: DragEvent, status: Status) {
		event.preventDefault();
		over = null;
		const id = event.dataTransfer?.getData('text/plain');
		const card = ui.cards.find((c) => c.id === id);
		if (card && card.status !== status) void move(card, status);
	}
</script>

<Dialog labelledby="cork-title" onclose={() => ctl.close()} variant="cork" width="full">
	<div class="cork">
		<header class="head">
			<div>
				<h2 id="cork-title">The cork board</h2>
				<p class="sub">
					{ui.cards.length} note{ui.cards.length === 1 ? '' : 's'} ·
					{ui.boardKind === 'firestore' ? 'kept in the realm (Firestore)' : ui.boardKind === 'local' ? 'kept in this browser (local realm)' : ui.boardKind === 'memory' ? 'kept for this visit only (storage is blocked)' : 'not available'}
				</p>
			</div>
			<div class="actions">
				<button type="button" class="btn btn-primary" onclick={() => ((ui.editing = null), ctl.open('drawing'))}>Plan a new idea</button>
				<button type="button" class="btn btn-secondary" onclick={() => ctl.close()}>Close</button>
			</div>
		</header>
		{#if ui.boardError}
			<p class="alert" data-kind="danger" role="alert"><span class="alert-body">{ui.boardError}</span></p>
		{/if}
		<div class="columns">
			{#each STATUSES as status (status)}
				{@const cards = column(ui.cards, status)}
				<section
					class="column"
					class:over={over === status}
					aria-labelledby="col-{status}"
					ondragover={(e) => {
						e.preventDefault();
						over = status;
					}}
					ondragleave={() => (over = over === status ? null : over)}
					ondrop={(e) => drop(e, status)}
				>
					<h3 id="col-{status}">{STATUS_LABELS[status]} <span class="count">{cards.length}</span></h3>
					{#if cards.length === 0}
						<p class="empty">{status === 'done' ? 'Finished work lands here, with a gold star.' : 'Nothing pinned here.'}</p>
					{:else}
						<ul role="list">
							{#each cards as card (card.id)}
								<li><StickyNote {card} tilt={tilt(card)} onmove={move} onedit={(c) => ctl.board.edit(c)} /></li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		</div>
	</div>
</Dialog>

<style>
	.cork {
		display: grid;
		gap: var(--space-4);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
	}
	.sub {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.columns {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-4);
		align-items: start;
	}
	.column {
		display: grid;
		align-content: start;
		gap: var(--space-3);
		min-height: calc(var(--space-8) * 3);
		padding: var(--space-3);
		background: color-mix(in srgb, var(--color-surface) 35%, transparent);
		border: 1px dashed var(--color-border-strong);
		border-radius: var(--radius-sm);
	}
	.column.over {
		border-style: solid;
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent-soft) 70%, transparent);
	}
	h3 {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin: 0;
		padding: var(--space-1) var(--space-2);
		font-family: var(--font-display);
		font-size: var(--text-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
	}
	.count {
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
	ul {
		display: grid;
		gap: var(--space-4);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.empty {
		margin: 0;
		font-size: var(--text-sm);
	}
	@media (max-width: 1023px) {
		.columns {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 599px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
