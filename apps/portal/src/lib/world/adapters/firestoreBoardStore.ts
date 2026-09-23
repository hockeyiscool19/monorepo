// BoardStore on Firestore — My Get-a-way's board on the real domain. Documents live at
// boards/getaway/cards/<GET-n>; boards/getaway holds `nextNumber`, advanced in a transaction so two tabs can
// never file the same key. firestore.rules lets only the `owner` group read or write any of it.

import type { FirebaseApp } from 'firebase/app';
import type { DocumentData, Timestamp } from 'firebase/firestore';
import { createCard, type Card, type CardDraft } from '../domain/board';
import { sanitize } from './localBoardStore';
import type { BoardStore } from '../application/ports';

type Firestore = typeof import('firebase/firestore');

const iso = (value: unknown): string | null =>
	value && typeof (value as Timestamp).toDate === 'function' ? (value as Timestamp).toDate().toISOString() : null;

/** Firestore document → Card (timestamps to ISO strings), validated like the local store's data. */
export function fromDoc(data: DocumentData): Card | null {
	const card = {
		...data,
		createdAt: iso(data.createdAt) ?? '',
		updatedAt: iso(data.updatedAt) ?? '',
		completedAt: iso(data.completedAt)
	};
	return sanitize([card])[0] ?? null;
}

export async function createFirestoreBoard(app: FirebaseApp, emulatorHost: string | null): Promise<BoardStore> {
	const fs: Firestore = await import('firebase/firestore');
	const db = fs.getFirestore(app);
	if (emulatorHost) {
		const [host, port] = emulatorHost.split(':');
		try {
			fs.connectFirestoreEmulator(db, host, Number(port));
		} catch {
			// Already connected (hot reload); the SDK allows it only once.
		}
	}
	const boardRef = fs.doc(db, 'boards', 'getaway');
	const cards = fs.collection(db, 'boards', 'getaway', 'cards');
	const stamp = (at: string) => fs.Timestamp.fromDate(new Date(at));

	/** Card → document: exactly the keys firestore.rules allows, timestamps as Timestamps. */
	const toDoc = (card: Card): DocumentData => ({
		key: card.key,
		number: card.number,
		title: card.title,
		description: card.description,
		type: card.type,
		priority: card.priority,
		status: card.status,
		labels: card.labels,
		createdAt: stamp(card.createdAt),
		updatedAt: stamp(card.updatedAt),
		completedAt: card.completedAt ? stamp(card.completedAt) : null,
		createdBy: card.createdBy
	});

	return {
		kind: 'firestore',
		subscribe(listener, onError) {
			return fs.onSnapshot(
				cards,
				(snap) => listener(snap.docs.flatMap((d) => fromDoc(d.data()) ?? [])),
				(error) => onError?.(error)
			);
		},
		async create(draft: CardDraft, uid: string, now: string) {
			return fs.runTransaction(db, async (tx) => {
				const board = await tx.get(boardRef);
				const stored = board.exists() ? Number(board.data().nextNumber) : 1;
				const number = Number.isInteger(stored) && stored >= 1 ? stored : 1;
				const card = createCard(draft, number, now, uid);
				tx.set(boardRef, { nextNumber: number + 1, updatedAt: fs.serverTimestamp() });
				tx.set(fs.doc(cards, card.id), toDoc(card));
				return card;
			});
		},
		async save(card: Card) {
			await fs.setDoc(fs.doc(cards, card.id), toDoc(card));
		},
		async remove(id: string) {
			await fs.deleteDoc(fs.doc(cards, id));
		}
	};
}
