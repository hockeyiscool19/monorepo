<script lang="ts">
	// The drawing board: plan a project the way Jira files an issue, minus the ceremony — a summary, a type,
	// a priority, a starting column, a few labels and notes. Pinning it puts a sticky on the cork board.
	// Also edits an existing card (and can take it down). Errors sit by their field and say how to fix them.
	import { CARD_TYPES, emptyDraft, parseLabels, PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS, TYPE_LABELS, type CardDraft, type DraftErrors } from '../domain/board';
	import { untrack } from 'svelte';
	import Dialog from './Dialog.svelte';
	import type { WorldController } from './controller';
	import type { WorldUi } from './state.svelte';

	let { ui, ctl }: { ui: WorldUi; ctl: WorldController } = $props();

	// The card being revised is fixed for the life of this form (a snapshot, deliberately not reactive).
	const editing = untrack(() => ui.editing);
	const start: CardDraft = editing
		? { title: editing.title, description: editing.description, type: editing.type, priority: editing.priority, status: editing.status, labels: editing.labels }
		: emptyDraft();
	let draft = $state<CardDraft>({ ...start, labels: [...start.labels] });
	let labels = $state(start.labels.join(', '));
	let errors = $state<DraftErrors>({});
	let busy = $state(false);
	let failure = $state<string | null>(null);
	let confirmRemove = $state(false);
	let titleInput: HTMLInputElement | undefined = $state();

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		failure = null;
		try {
			const result = await ctl.board.save({ ...draft, labels: parseLabels(labels) });
			if (!result.ok) {
				errors = result.errors;
				if (result.errors.title) titleInput?.focus();
			}
		} catch (e) {
			failure = e instanceof Error ? e.message : 'The card could not be pinned.';
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!editing) return;
		if (!confirmRemove) {
			confirmRemove = true;
			return;
		}
		await ctl.board.remove(editing);
		ui.editing = null;
		ctl.open('cork');
	}
</script>

<Dialog labelledby="drawing-title" onclose={() => ctl.close()} variant="paper" width="md">
	<form class="board" onsubmit={submit} novalidate>
		<header class="head">
			<h2 id="drawing-title">{editing ? `Revise ${editing.key}` : 'The drawing board'}</h2>
			<p class="sub">{editing ? 'Change the plan, or take it down.' : 'Sketch a new project. It will be pinned to the cork board as a sticky note.'}</p>
		</header>

		{#if ui.boardKind === 'none'}
			<p class="alert" data-kind="warning"><span class="alert-body">The board belongs to the Jarl's Court; sign in as its member to plan here.</span></p>
		{/if}
		{#if failure}
			<p class="alert" data-kind="danger" role="alert"><span class="alert-body">{failure}</span></p>
		{/if}

		<div class="field">
			<label for="card-title">Summary (required)</label>
			<input
				bind:this={titleInput}
				id="card-title"
				type="text"
				maxlength="140"
				autocomplete="off"
				bind:value={draft.title}
				aria-invalid={errors.title ? 'true' : undefined}
				aria-describedby={errors.title ? 'card-title-error' : undefined}
			/>
			{#if errors.title}<p id="card-title-error" class="error">{errors.title}</p>{/if}
		</div>

		<div class="grid">
			<fieldset class="field">
				<legend>Type</legend>
				<div class="choices">
					{#each CARD_TYPES as type (type)}
						<label class="choice" data-type={type}><input type="radio" name="card-type" value={type} bind:group={draft.type} /> {TYPE_LABELS[type]}</label>
					{/each}
				</div>
			</fieldset>
			<div class="field">
				<label for="card-priority">Priority</label>
				<select id="card-priority" bind:value={draft.priority}>
					{#each [...PRIORITIES].reverse() as priority (priority)}
						<option value={priority}>{PRIORITY_LABELS[priority]}</option>
					{/each}
				</select>
			</div>
			<div class="field">
				<label for="card-status">Column</label>
				<select id="card-status" bind:value={draft.status}>
					{#each STATUSES as status (status)}
						<option value={status}>{STATUS_LABELS[status]}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="field">
			<label for="card-labels">Labels (optional, separated by commas)</label>
			<input
				id="card-labels"
				type="text"
				autocomplete="off"
				bind:value={labels}
				aria-invalid={errors.labels ? 'true' : undefined}
				aria-describedby={errors.labels ? 'card-labels-error' : 'card-labels-hint'}
			/>
			{#if errors.labels}<p id="card-labels-error" class="error">{errors.labels}</p>{:else}<p id="card-labels-hint" class="hint">For example: roadmap, 3d, vale</p>{/if}
		</div>

		<div class="field">
			<label for="card-notes">Notes (optional)</label>
			<textarea
				id="card-notes"
				rows="4"
				bind:value={draft.description}
				aria-invalid={errors.description ? 'true' : undefined}
				aria-describedby={errors.description ? 'card-notes-error' : undefined}
			></textarea>
			{#if errors.description}<p id="card-notes-error" class="error">{errors.description}</p>{/if}
		</div>

		<div class="actions">
			<button type="submit" class="btn btn-primary" disabled={busy || ui.boardKind === 'none'}>{editing ? 'Save changes' : 'Pin to the cork board'}</button>
			<button type="button" class="btn btn-secondary" onclick={() => ctl.close()}>Cancel</button>
			{#if editing}
				<button type="button" class="btn btn-text danger" onclick={remove}>{confirmRemove ? `Yes, take ${editing.key} down` : 'Take down'}</button>
			{/if}
		</div>
	</form>
</Dialog>

<style>
	.board {
		display: grid;
		gap: var(--space-4);
	}
	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
	}
	.sub {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}
	.grid {
		display: grid;
		gap: var(--space-3) var(--space-4);
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
	}
	.field {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	label,
	legend {
		font-weight: var(--weight-medium);
	}
	input[type='text'],
	select,
	textarea {
		box-sizing: border-box;
		width: 100%;
		min-height: var(--control-height);
		padding: var(--space-2) var(--space-3);
		font: inherit;
		color: var(--color-text);
		background: var(--color-surface);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
	}
	textarea {
		resize: vertical;
	}
	[aria-invalid='true'] {
		border-color: var(--color-danger);
	}
	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.choice {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--control-height);
		padding: 0 var(--space-3);
		font-weight: var(--weight-regular);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
	}
	.choice[data-type='idea'] {
		background: var(--color-warning-soft);
	}
	.choice[data-type='feature'] {
		background: var(--color-info-soft);
	}
	.choice[data-type='fix'] {
		background: var(--color-danger-soft);
	}
	.choice[data-type='chore'] {
		background: var(--color-success-soft);
	}
	.error {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-danger);
	}
	.hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	.danger {
		color: var(--color-danger);
	}
	@media (max-width: 767px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
