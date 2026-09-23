// Ports: what the world's use cases need from the outside, each with one request in and one result out.
// Adapters (Firebase Auth, the gateway door over HTTP, localStorage, Firestore) implement them;
// World.svelte is the composition root that picks one adapter per port.

import type { Viewer } from '../domain/access';
import type { Card, CardDraft } from '../domain/board';
import type { RealmGate } from '../domain/realm';

export type AuthErrorCode =
	| 'invalid_credentials'
	| 'email_in_use'
	| 'weak_password'
	| 'invalid_email'
	| 'popup_closed'
	| 'popup_blocked'
	| 'network'
	| 'too_many_requests'
	| 'unavailable'
	| 'unknown';

/** A sign-in failure with a stable code; `message` is written for the traveller and says how to recover. */
export class AuthError extends Error {
	readonly code: AuthErrorCode;
	constructor(code: AuthErrorCode, message: string) {
		super(message);
		this.name = 'AuthError';
		this.code = code;
	}
}

export interface RegisterRequest {
	name: string;
	email: string;
	password: string;
}

/** Platform identity (Firebase Authentication in the Hosting project). */
export interface AuthPort {
	/** False when this build cannot sign anyone in (no Firebase configuration). */
	readonly available: boolean;
	/** Where the identity lives, for the profile screen ("Firebase · researcher-455022", "Auth emulator", …). */
	readonly label: string;
	/** Called with the current viewer once known, then on every change. Returns an unsubscribe function. */
	subscribe(listener: (viewer: Viewer | null) => void): () => void;
	signInWithGoogle(): Promise<void>;
	signInWithEmail(email: string, password: string): Promise<void>;
	register(request: RegisterRequest): Promise<void>;
	resetPassword(email: string): Promise<void>;
	signOut(): Promise<void>;
	/** A current ID token; `forceRefresh` picks up groups granted since the last sign-in. */
	idToken(forceRefresh?: boolean): Promise<string | null>;
}

export type DoorFailure = 'sign_in_required' | 'group_required' | 'session_expired' | 'door_unconfigured' | 'unavailable';

export type DoorResult = { ok: true; expiresAt: string | null } | { ok: false; reason: DoorFailure };

/** The gateway door in front of an app with `access`: trade an ID token for a door session, or give it back. */
export interface DoorPort {
	open(gate: RealmGate, idToken: string): Promise<DoorResult>;
	close(gate: RealmGate): Promise<void>;
}

/** Where My Get-a-way's cards live. `subscribe` pushes the whole board on every change. */
export interface BoardStore {
	readonly kind: 'local' | 'firestore' | 'memory';
	subscribe(listener: (cards: Card[]) => void, onError?: (error: Error) => void): () => void;
	/** Allocate the next GET-n number and store a new card built from a validated draft. */
	create(draft: CardDraft, uid: string, now: string): Promise<Card>;
	save(card: Card): Promise<void>;
	remove(id: string): Promise<void>;
}

/** Leaving the world for an app. */
export interface Navigator {
	go(href: string): void;
}
