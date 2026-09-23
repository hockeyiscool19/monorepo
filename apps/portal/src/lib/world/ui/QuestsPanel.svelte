<script lang="ts">
	// The quest log: the cork board read as quests — active ones, finished ones — and your level, earned by
	// finishing them (level n needs n³ EXP, the "medium fast" curve of the games it nods to).
	import { column, levelProgress, STATUSES, STATUS_LABELS, totalExp } from '../domain/board';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();

	let exp = $derived(totalExp(ui.cards));
	let progress = $derived(levelProgress(exp));
	let active = $derived(column(ui.cards, 'doing'));
	let done = $derived(column(ui.cards, 'done').slice(0, 5));
</script>

<section class="quests" aria-labelledby="quests-heading">
	<h3 id="quests-heading">Quests</h3>
	{#if ui.boardKind === 'none'}
		<p>The quest log lives on the cork board in My Get-a-way, which belongs to the Jarl's Court.</p>
	{:else}
		<div class="level">
			<p class="lv">Lv. {progress.level}</p>
			<div class="bar" role="meter" aria-label="Experience toward level {progress.level + 1}" aria-valuemin="0" aria-valuemax={progress.span} aria-valuenow={progress.into}>
				<span style:width="{progress.fraction * 100}%"></span>
			</div>
			<p class="exp">{exp} EXP · {progress.span - progress.into} to Lv. {progress.level + 1}</p>
		</div>
		<dl class="counts">
			{#each STATUSES as status (status)}
				<div><dt>{STATUS_LABELS[status]}</dt><dd>{column(ui.cards, status).length}</dd></div>
			{/each}
		</dl>
		<h4>Active quests</h4>
		{#if active.length === 0}
			<p>No quest is in progress. Move a card to In Progress on the cork board.</p>
		{:else}
			<ul role="list">
				{#each active as card (card.id)}
					<li><strong>{card.key}</strong> {card.title}</li>
				{/each}
			</ul>
		{/if}
		<h4>Completed</h4>
		{#if done.length === 0}
			<p>Nothing completed yet. Finish a card and watch it evolve.</p>
		{:else}
			<ul role="list">
				{#each done as card (card.id)}
					<li><span aria-hidden="true">★</span> <strong>{card.key}</strong> {card.title}</li>
				{/each}
			</ul>
		{/if}
		<div class="actions">
			<button type="button" class="btn btn-secondary" onclick={() => ctl.open('cork')}>Open the cork board</button>
			<button type="button" class="btn btn-text" onclick={() => ((ui.editing = null), ctl.open('drawing'))}>Plan a new idea</button>
		</div>
	{/if}
</section>

<style>
	.quests {
		display: grid;
		gap: var(--space-3);
	}
	h3,
	h4 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
	}
	p {
		margin: 0;
	}
	.level {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-1) var(--space-3);
		align-items: center;
		padding: var(--space-3);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.lv {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: var(--weight-bold);
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
	.exp {
		grid-column: 2;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
	.counts {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-2);
		margin: 0;
	}
	.counts div {
		padding: var(--space-2);
		text-align: center;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	dt {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}
	dd {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-xl);
	}
	ul {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding-left: var(--space-5);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	@media (max-width: 599px) {
		.counts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
