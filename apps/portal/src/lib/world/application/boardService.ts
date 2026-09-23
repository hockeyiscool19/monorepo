// Use cases of the drawing board: file a new idea, edit it, move it along the workflow, tear it down.
// Every change that completes a card reports it, so the world can play the evolution.

import { completes, editCard, validateDraft, withStatus, type Card, type CardDraft, type DraftErrors, type Status } from '../domain/board';
import type { BoardStore } from './ports';

export type SaveOutcome = { ok: true; card: Card; completed: boolean } | { ok: false; errors: DraftErrors };

export interface BoardDeps {
	store: BoardStore;
	uid: string;
	now: () => string;
}

export async function fileCard(deps: BoardDeps, draft: CardDraft): Promise<SaveOutcome> {
	const result = validateDraft(draft);
	if (!result.ok) return result;
	const card = await deps.store.create(result.value, deps.uid, deps.now());
	return { ok: true, card, completed: card.status === 'done' };
}

export async function reviseCard(deps: BoardDeps, card: Card, draft: CardDraft): Promise<SaveOutcome> {
	const result = validateDraft(draft);
	if (!result.ok) return result;
	const next = editCard(card, result.value, deps.now());
	await deps.store.save(next);
	return { ok: true, card: next, completed: completes(card, next) };
}

export async function moveCard(deps: BoardDeps, card: Card, status: Status): Promise<{ card: Card; completed: boolean }> {
	const next = withStatus(card, status, deps.now());
	if (next !== card) await deps.store.save(next);
	return { card: next, completed: completes(card, next) };
}

export async function tearDown(deps: BoardDeps, card: Card): Promise<void> {
	await deps.store.remove(card.id);
}
