// The owner's Firestore board against the real firestore.rules, in the local emulators. Skipped unless both
// emulators are running (`scripts/realm-rehearsal.sh emulators`, then FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
// FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm test). Test identities live only in the emulator.
import { randomBytes } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { describe, expect, it } from 'vitest';
import { createFirestoreBoard } from '../../src/lib/world/adapters/firestoreBoardStore';
import { emptyDraft, withStatus, type Card } from '../../src/lib/world/domain/board';

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const STORE = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'researcher-455022';

async function testUser(groups: string[]): Promise<{ email: string; password: string }> {
	const email = `board-${randomBytes(4).toString('hex')}@example.com`;
	const password = randomBytes(12).toString('base64url');
	const res = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password, returnSecureToken: true })
	});
	const { localId } = (await res.json()) as { localId: string };
	await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
		body: JSON.stringify({ localId, customAttributes: JSON.stringify({ groups }) })
	});
	return { email, password };
}

async function boardFor(groups: string[], name: string) {
	const app = initializeApp({ apiKey: 'demo-api-key', projectId: PROJECT, appId: 'demo-app-id' }, name);
	const auth = getAuth(app);
	connectAuthEmulator(auth, `http://${AUTH}`, { disableWarnings: true });
	const { email, password } = await testUser(groups);
	const { user } = await signInWithEmailAndPassword(auth, email, password);
	return { app, uid: user.uid, board: await createFirestoreBoard(app, STORE ?? null) };
}

function firstSnapshot(board: Awaited<ReturnType<typeof boardFor>>['board']): Promise<Card[] | Error> {
	return new Promise((resolve) => {
		const stop = board.subscribe(
			(cards) => {
				stop();
				resolve(cards);
			},
			(error) => resolve(error)
		);
	});
}

describe.skipIf(!AUTH || !STORE)('Firestore board in the emulators', () => {
	it('lets the owner file, move, complete and take down a card', async () => {
		const { app, uid, board } = await boardFor(['owner'], 'owner');
		const now = new Date().toISOString();
		const card = await board.create({ ...emptyDraft(), title: 'Emulator card', type: 'feature', priority: 'high' }, uid, now);
		expect(card.key).toMatch(/^GET-\d+$/);
		const done = withStatus(card, 'done', new Date().toISOString());
		await board.save(done);
		const cards = await firstSnapshot(board);
		expect(cards).not.toBeInstanceOf(Error);
		expect((cards as Card[]).find((c) => c.key === card.key)).toMatchObject({ status: 'done', createdBy: uid, type: 'feature' });
		await board.remove(card.id);
		await deleteApp(app);
	}, 20000);

	it('refuses a traveller who is not in the Jarl’s Court', async () => {
		const { app, uid, board } = await boardFor(['vale'], 'stranger');
		await expect(board.create({ ...emptyDraft(), title: 'Not mine to plan' }, uid, new Date().toISOString())).rejects.toThrow(/permission/i);
		expect(await firstSnapshot(board)).toBeInstanceOf(Error);
		await deleteApp(app);
	}, 20000);
});
