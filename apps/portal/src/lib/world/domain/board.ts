// The drawing board's project cards: Jira's creation flow, much simpler. A card has a key (GET-7), a type,
// a priority and a status that walks Ideas → To Do → In Progress → Done. Completing one earns EXP.
// Pure: no DOM, no storage, no clock (callers pass `now`). The Firestore rules enforce the same shape.

export const CARD_TYPES = ['idea', 'feature', 'fix', 'chore'] as const;
export const PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest'] as const;
export const STATUSES = ['backlog', 'todo', 'doing', 'done'] as const;

export type CardType = (typeof CARD_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

export const KEY_PREFIX = 'GET';
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const LABELS_MAX = 5;
export const LABEL_MAX = 24;

export interface Card {
	/** Same as `key`; also the document id. */
	id: string;
	key: string;
	number: number;
	title: string;
	description: string;
	type: CardType;
	priority: Priority;
	status: Status;
	labels: string[];
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
	createdBy: string;
}

/** What the drawing board form collects. */
export interface CardDraft {
	title: string;
	description: string;
	type: CardType;
	priority: Priority;
	status: Status;
	labels: string[];
}

export const TYPE_LABELS: Record<CardType, string> = { idea: 'Idea', feature: 'Feature', fix: 'Fix', chore: 'Chore' };
export const PRIORITY_LABELS: Record<Priority, string> = {
	lowest: 'Lowest',
	low: 'Low',
	medium: 'Medium',
	high: 'High',
	highest: 'Highest'
};
export const STATUS_LABELS: Record<Status, string> = { backlog: 'Ideas', todo: 'To Do', doing: 'In Progress', done: 'Done' };

/** What a completed card of each type evolves into (the Pokémon-style line). */
export const EVOLVES_INTO: Record<CardType, string> = {
	idea: 'Reality',
	feature: 'Release',
	fix: 'Patch',
	chore: 'Clean Slate'
};

export function emptyDraft(): CardDraft {
	return { title: '', description: '', type: 'idea', priority: 'medium', status: 'backlog', labels: [] };
}

/** "roadmap, ui ,  UI" → ["roadmap", "ui"]: trimmed, de-duplicated case-insensitively, empties dropped. */
export function parseLabels(text: string): string[] {
	const out: string[] = [];
	for (const raw of text.split(',')) {
		const label = raw.trim().replace(/\s+/g, ' ');
		if (label && !out.some((l) => l.toLowerCase() === label.toLowerCase())) out.push(label);
	}
	return out;
}

export type DraftErrors = Partial<Record<'title' | 'description' | 'labels', string>>;

export type DraftResult = { ok: true; value: CardDraft } | { ok: false; errors: DraftErrors };

/** Validate and normalise a draft. Messages say what is wrong and how to fix it. */
export function validateDraft(draft: CardDraft): DraftResult {
	const errors: DraftErrors = {};
	const title = draft.title.trim().replace(/\s+/g, ' ');
	const description = draft.description.trim();
	if (!title) errors.title = 'Give the idea a title, for example “Sketch the Colorado room”.';
	else if (title.length > TITLE_MAX) errors.title = `Shorten the title to ${TITLE_MAX} characters or fewer (it has ${title.length}).`;
	if (description.length > DESCRIPTION_MAX)
		errors.description = `Shorten the notes to ${DESCRIPTION_MAX} characters or fewer (they have ${description.length}).`;
	if (draft.labels.length > LABELS_MAX) errors.labels = `Use at most ${LABELS_MAX} labels, separated by commas.`;
	else if (draft.labels.some((l) => l.length > LABEL_MAX)) errors.labels = `Keep each label to ${LABEL_MAX} characters or fewer.`;
	if (Object.keys(errors).length > 0) return { ok: false, errors };
	const pick = <T extends string>(value: T, allowed: readonly T[], fallback: T): T => (allowed.includes(value) ? value : fallback);
	return {
		ok: true,
		value: {
			title,
			description,
			type: pick(draft.type, CARD_TYPES, 'idea'),
			priority: pick(draft.priority, PRIORITIES, 'medium'),
			status: pick(draft.status, STATUSES, 'backlog'),
			labels: draft.labels
		}
	};
}

export function keyFor(number: number): string {
	return `${KEY_PREFIX}-${number}`;
}

/** The next free card number: one past the highest number seen (and never below `floor`). */
export function nextNumber(cards: Pick<Card, 'number'>[], floor = 1): number {
	return cards.reduce((n, c) => Math.max(n, c.number + 1), floor);
}

export function createCard(draft: CardDraft, number: number, now: string, uid: string): Card {
	const key = keyFor(number);
	return {
		id: key,
		key,
		number,
		...draft,
		createdAt: now,
		updatedAt: now,
		completedAt: draft.status === 'done' ? now : null,
		createdBy: uid
	};
}

/** Apply an edit. Key, number, author and creation time never change; completion follows the status. */
export function editCard(card: Card, draft: CardDraft, now: string): Card {
	return withStatus({ ...card, ...draft, status: card.status, updatedAt: now }, draft.status, now);
}

/** Move a card to `status`. Entering Done stamps completedAt; leaving Done clears it. */
export function withStatus(card: Card, status: Status, now: string): Card {
	if (card.status === status) return card;
	const completedAt = status === 'done' ? now : null;
	return { ...card, status, completedAt, updatedAt: now };
}

/** True when this change completes the card — the moment the evolution plays. */
export function completes(before: Pick<Card, 'status'> | null, after: Pick<Card, 'status'>): boolean {
	return after.status === 'done' && before?.status !== 'done';
}

export function neighbourStatus(status: Status, step: -1 | 1): Status | null {
	const i = STATUSES.indexOf(status) + step;
	return i >= 0 && i < STATUSES.length ? STATUSES[i] : null;
}

const PRIORITY_RANK: Record<Priority, number> = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };

/** Cards of one column: Done shows the latest completions first, the others highest priority, then oldest key. */
export function column(cards: Card[], status: Status): Card[] {
	const inColumn = cards.filter((c) => c.status === status);
	if (status === 'done') return inColumn.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || b.number - a.number);
	return inColumn.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.number - b.number);
}

// ---- EXP and levels (Pokémon's "medium fast" curve: level n needs n³ EXP) ----------------------------------

const PRIORITY_EXP: Record<Priority, number> = { lowest: 5, low: 10, medium: 20, high: 35, highest: 50 };
const TYPE_EXP: Record<CardType, number> = { idea: 15, feature: 10, fix: 5, chore: 0 };

export function expFor(card: Pick<Card, 'priority' | 'type'>): number {
	return PRIORITY_EXP[card.priority] + TYPE_EXP[card.type];
}

export function totalExp(cards: Card[]): number {
	return cards.filter((c) => c.status === 'done').reduce((sum, c) => sum + expFor(c), 0);
}

export function levelFor(exp: number): number {
	let level = 1;
	while ((level + 1) ** 3 <= exp) level++;
	return level;
}

/** Where `exp` sits between its level's floor and the next level, as a fraction in [0, 1]. */
export function levelProgress(exp: number): { level: number; into: number; span: number; fraction: number } {
	const level = levelFor(exp);
	const floor = level === 1 ? 0 : level ** 3;
	const span = (level + 1) ** 3 - floor;
	const into = exp - floor;
	return { level, into, span, fraction: Math.min(1, Math.max(0, into / span)) };
}
