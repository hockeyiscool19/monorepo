// My Get-a-way's board: which store holds it (localStorage when the realm is open, Firestore for the owner
// when it is guarded, nothing for anyone else), and the moves a traveller makes on it. Completing a card
// hands it to the evolution.

import { GETAWAY, spaceState, type AccessContext, type RealmMode } from '../domain/access';
import { totalExp, type Card, type CardDraft, type Status } from '../domain/board';
import { fileCard, moveCard, reviseCard, tearDown, type SaveOutcome } from '../application/boardService';
import type { BoardStore } from '../application/ports';
import type { FirebaseRuntime } from '../adapters/firebaseAuth';
import { LocalBoardStore } from '../adapters/localBoardStore';
import type { Overlay, WorldUi } from './state.svelte';

const now = () => new Date().toISOString();

export interface BoardHost {
	mode: RealmMode;
	access(): AccessContext;
	firebase(): FirebaseRuntime | null;
	onCards(cards: Card[]): void;
	open(overlay: Exclude<Overlay, null>): void;
	close(): void;
}

export class BoardController {
	private store: BoardStore | null = null;
	private unsubscribe: (() => void) | null = null;
	private storageListener: ((e: StorageEvent) => void) | null = null;

	constructor(
		private readonly ui: WorldUi,
		private readonly host: BoardHost
	) {}

	/** (Re)connect after every sign-in change: the owner's Firestore board, the local board, or none. */
	async connect(): Promise<void> {
		const firebase = this.host.firebase();
		const owner = spaceState(GETAWAY, this.host.access()).kind === 'open';
		const kind = this.host.mode === 'open' ? 'local' : owner && firebase ? 'firestore' : 'none';
		if (this.store && this.ui.boardKind === kind) return;
		this.disconnect();
		this.ui.boardError = null;
		if (kind === 'none') {
			this.setCards([]);
			this.ui.boardKind = 'none';
			return;
		}
		try {
			if (kind === 'firestore' && firebase) {
				const { createFirestoreBoard } = await import('../adapters/firestoreBoardStore');
				this.store = await createFirestoreBoard(firebase.app, firebase.setup.firestoreEmulatorHost);
			} else {
				let storage: Storage | null = null;
				try {
					storage = window.localStorage;
				} catch {
					storage = null;
				}
				const local = new LocalBoardStore(storage, now);
				this.storageListener = local.onStorage;
				window.addEventListener('storage', local.onStorage);
				this.store = local;
			}
			this.ui.boardKind = this.store.kind;
			this.unsubscribe = this.store.subscribe(
				(cards) => this.setCards(cards),
				(error) => (this.ui.boardError = `The cork board could not be read: ${error.message}`)
			);
		} catch (error) {
			this.ui.boardError = error instanceof Error ? error.message : 'The cork board could not be reached.';
		}
	}

	private disconnect(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		if (this.storageListener) window.removeEventListener('storage', this.storageListener);
		this.storageListener = null;
		this.store = null;
	}

	private setCards(cards: Card[]): void {
		this.ui.cards = cards;
		this.host.onCards(cards);
	}

	private deps() {
		if (!this.store) throw new Error('The cork board is not available.');
		return { store: this.store, uid: this.ui.viewer?.uid ?? 'local', now };
	}

	/** File a new card (or save the one being edited); then show it on the cork board, or evolve it. */
	async save(draft: CardDraft): Promise<SaveOutcome> {
		const editing = this.ui.editing;
		const exp = totalExp(this.ui.cards);
		const result = editing ? await reviseCard(this.deps(), editing, draft) : await fileCard(this.deps(), draft);
		if (result.ok) {
			this.ui.editing = null;
			this.ui.toast(editing ? `${result.card.key} updated on the cork board.` : `${result.card.key} pinned to the cork board.`);
			if (result.completed) this.evolve(result.card, exp);
			else this.host.open('cork');
		}
		return result;
	}

	async move(card: Card, status: Status): Promise<void> {
		const exp = totalExp(this.ui.cards);
		const result = await moveCard(this.deps(), card, status);
		if (result.completed) this.evolve(result.card, exp);
		else this.ui.announcement = `${card.key} moved.`;
	}

	async remove(card: Card): Promise<void> {
		await tearDown(this.deps(), card);
		this.ui.toast(`${card.key} taken down.`);
	}

	edit(card: Card): void {
		this.ui.editing = card;
		this.host.open('drawing');
	}

	private evolve(card: Card, expBefore: number): void {
		const cards = this.ui.cards.some((c) => c.id === card.id) ? this.ui.cards.map((c) => (c.id === card.id ? card : c)) : [...this.ui.cards, card];
		this.ui.evolving = { card, expBefore, expAfter: totalExp(cards) };
		this.host.open('evolution');
	}

	/** After the evolution, back to the cork board to see the card with its gold star. */
	finishEvolution(): void {
		this.ui.evolving = null;
		this.host.open('cork');
	}

	dispose(): void {
		this.disconnect();
	}
}
