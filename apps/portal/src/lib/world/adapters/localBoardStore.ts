// BoardStore in this browser's localStorage — My Get-a-way's board when Eisenhold runs locally.
// Storage can be blocked (private windows, strict settings); the store then keeps cards in memory for the
// visit and says so through `kind`. Other tabs stay in step through the `storage` event.

import {
	CARD_TYPES,
	createCard,
	nextNumber,
	PRIORITIES,
	STATUSES,
	type Card,
	type CardDraft
} from '../domain/board';
import type { BoardStore } from '../application/ports';

export const STORAGE_KEY = 'eisenhold.getaway.board.v1';

interface Stored {
	cards: Card[];
	seeded: boolean;
}

const isString = (v: unknown): v is string => typeof v === 'string';

/** Keep only well-formed cards; anything a hand-edited or older copy got wrong is dropped, not trusted. */
export function sanitize(raw: unknown): Card[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((c): Card[] => {
		if (typeof c !== 'object' || c === null) return [];
		const r = c as Record<string, unknown>;
		const ok =
			isString(r.key) &&
			/^GET-\d{1,6}$/.test(r.key) &&
			Number.isInteger(r.number) &&
			isString(r.title) &&
			isString(r.description) &&
			CARD_TYPES.includes(r.type as never) &&
			PRIORITIES.includes(r.priority as never) &&
			STATUSES.includes(r.status as never) &&
			Array.isArray(r.labels) &&
			r.labels.every(isString) &&
			isString(r.createdAt) &&
			isString(r.updatedAt) &&
			(r.completedAt === null || isString(r.completedAt)) &&
			isString(r.createdBy);
		return ok ? [{ ...(r as unknown as Card), id: r.key as string }] : [];
	});
}

/** First-visit notes so the cork board is never bare; the realm's own build is the first shipped project. */
export function seedCards(now: string): Card[] {
	const seed = (n: number, draft: CardDraft) => createCard(draft, n, now, 'local');
	return [
		seed(1, { title: 'Build a Skyrim-style realm for eisensoftware', description: 'Gates from the registry, a warded Vale door, a cabin with Colorado inside.', type: 'feature', priority: 'highest', status: 'done', labels: ['platform'] }),
		seed(2, { title: 'Walk through every gate in Eisenhold', description: 'Vale, HealthConnect, Topology — and read the Word Wall.', type: 'idea', priority: 'medium', status: 'todo', labels: ['explore'] }),
		seed(3, { title: 'Sketch the next app on the drawing board', description: 'What should the fourth gate open onto?', type: 'idea', priority: 'high', status: 'backlog', labels: ['roadmap'] })
	];
}

export class LocalBoardStore implements BoardStore {
	kind: 'local' | 'memory';
	private cards: Card[] = [];
	private readonly listeners = new Set<(cards: Card[]) => void>();
	private readonly storage: Storage | null;

	constructor(storage: Storage | null, now: () => string) {
		this.storage = storage;
		this.kind = storage ? 'local' : 'memory';
		const stored = this.read();
		if (stored) this.cards = stored.cards;
		if (!stored?.seeded) {
			this.cards = [...seedCards(now()), ...this.cards];
			this.write();
		}
	}

	private read(): Stored | null {
		if (!this.storage) return null;
		try {
			const text = this.storage.getItem(STORAGE_KEY);
			if (!text) return null;
			const parsed = JSON.parse(text) as { cards?: unknown; seeded?: unknown };
			return { cards: sanitize(parsed.cards), seeded: parsed.seeded === true };
		} catch {
			return null;
		}
	}

	private write(): void {
		if (!this.storage) return;
		try {
			this.storage.setItem(STORAGE_KEY, JSON.stringify({ cards: this.cards, seeded: true }));
		} catch {
			this.kind = 'memory';
		}
	}

	private emit(): void {
		const snapshot = [...this.cards];
		for (const l of this.listeners) l(snapshot);
	}

	/** Pick up changes another tab wrote. */
	readonly onStorage = (event: StorageEvent): void => {
		if (event.key !== STORAGE_KEY) return;
		this.cards = this.read()?.cards ?? this.cards;
		this.emit();
	};

	subscribe(listener: (cards: Card[]) => void): () => void {
		this.listeners.add(listener);
		listener([...this.cards]);
		return () => this.listeners.delete(listener);
	}

	async create(draft: CardDraft, uid: string, now: string): Promise<Card> {
		const card = createCard(draft, nextNumber(this.cards), now, uid);
		this.cards = [...this.cards, card];
		this.write();
		this.emit();
		return card;
	}

	async save(card: Card): Promise<void> {
		this.cards = this.cards.map((c) => (c.id === card.id ? card : c));
		this.write();
		this.emit();
	}

	async remove(id: string): Promise<void> {
		this.cards = this.cards.filter((c) => c.id !== id);
		this.write();
		this.emit();
	}
}
