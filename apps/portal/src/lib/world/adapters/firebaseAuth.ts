// AuthPort on the Firebase JS SDK. Loaded lazily (dynamic import) so the world starts without it.
// Groups come from the ID token's custom claim `groups`; onIdTokenChanged re-reads them after every refresh,
// so a grant made with scripts/grant-groups.mjs shows up as soon as the token is refreshed.

import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Viewer } from '../domain/access';
import { AuthError, type AuthErrorCode, type AuthPort, type RegisterRequest } from '../application/ports';
import type { FirebaseSetup } from './firebaseConfig';

const MESSAGES: Record<AuthErrorCode, string> = {
	invalid_credentials: 'That email and password do not match. Check both, or reset your password.',
	email_in_use: 'An account already uses that email. Sign in instead, or reset the password.',
	weak_password: 'Choose a password of at least 8 characters.',
	invalid_email: 'Enter an email address like name@example.com.',
	popup_closed: 'The Google window closed before sign-in finished. Try again.',
	popup_blocked: 'Your browser blocked the Google window. Allow pop-ups for this site, or use email and password.',
	network: 'The sign-in service could not be reached. Check your connection and try again.',
	too_many_requests: 'Too many attempts. Wait a minute, then try again.',
	unavailable: 'Sign-in is not enabled for this realm yet. The runbook docs/runbooks/platform-auth.md has the steps.',
	unknown: 'Sign-in failed. Try again in a moment.'
};

const CODES: Record<string, AuthErrorCode> = {
	'auth/invalid-credential': 'invalid_credentials',
	'auth/invalid-login-credentials': 'invalid_credentials',
	'auth/wrong-password': 'invalid_credentials',
	'auth/user-not-found': 'invalid_credentials',
	'auth/email-already-in-use': 'email_in_use',
	'auth/weak-password': 'weak_password',
	'auth/password-does-not-meet-requirements': 'weak_password',
	'auth/invalid-email': 'invalid_email',
	'auth/missing-email': 'invalid_email',
	'auth/popup-closed-by-user': 'popup_closed',
	'auth/cancelled-popup-request': 'popup_closed',
	'auth/popup-blocked': 'popup_blocked',
	'auth/network-request-failed': 'network',
	'auth/too-many-requests': 'too_many_requests',
	'auth/operation-not-allowed': 'unavailable',
	'auth/configuration-not-found': 'unavailable',
	'auth/unauthorized-domain': 'unavailable',
	'auth/invalid-api-key': 'unavailable',
	'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'unavailable'
};

export function toAuthError(error: unknown): AuthError {
	if (error instanceof AuthError) return error;
	const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
	const mapped = CODES[code] ?? 'unknown';
	return new AuthError(mapped, MESSAGES[mapped]);
}

function groupsOf(claims: Record<string, unknown>): string[] {
	const raw = claims['groups'];
	return Array.isArray(raw) ? raw.filter((g): g is string => typeof g === 'string') : [];
}

async function toViewer(user: User): Promise<Viewer> {
	const token = await user.getIdTokenResult();
	return {
		uid: user.uid,
		email: user.email,
		name: user.displayName,
		photoUrl: user.photoURL,
		provider: token.signInProvider ?? user.providerData[0]?.providerId ?? null,
		emailVerified: user.emailVerified,
		groups: groupsOf(token.claims),
		createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime).toISOString() : null
	};
}

export interface FirebaseRuntime {
	app: FirebaseApp;
	auth: AuthPort;
	setup: FirebaseSetup;
}

/** Initialise the Firebase app once and wrap Auth in the AuthPort. */
export async function createFirebaseRuntime(setup: FirebaseSetup): Promise<FirebaseRuntime> {
	const { initializeApp, getApps } = await import('firebase/app');
	const sdk = await import('firebase/auth');
	const app = getApps()[0] ?? initializeApp(setup.config);
	const auth: Auth = sdk.getAuth(app);
	if (setup.authEmulatorHost) sdk.connectAuthEmulator(auth, `http://${setup.authEmulatorHost}`, { disableWarnings: true });

	const listeners = new Set<(viewer: Viewer | null) => void>();
	let current: Viewer | null | undefined;
	const publish = (viewer: Viewer | null) => {
		current = viewer;
		for (const l of listeners) l(viewer);
	};
	sdk.onIdTokenChanged(auth, (user) => {
		if (!user) return publish(null);
		toViewer(user).then(publish, () => publish(null));
	});

	const run = async (action: () => Promise<unknown>) => {
		try {
			await action();
		} catch (error) {
			throw toAuthError(error);
		}
	};

	const port: AuthPort = {
		available: true,
		label: setup.source === 'emulator' ? `Auth emulator · ${setup.config.projectId}` : `Firebase · ${setup.config.projectId}`,
		subscribe(listener) {
			listeners.add(listener);
			if (current !== undefined) listener(current);
			return () => listeners.delete(listener);
		},
		signInWithGoogle: () => run(() => sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider())),
		signInWithEmail: (email, password) => run(() => sdk.signInWithEmailAndPassword(auth, email.trim(), password)),
		register: ({ name, email, password }: RegisterRequest) =>
			run(async () => {
				if (password.length < 8) throw new AuthError('weak_password', MESSAGES.weak_password);
				const { user } = await sdk.createUserWithEmailAndPassword(auth, email.trim(), password);
				if (name.trim()) await sdk.updateProfile(user, { displayName: name.trim() });
				await sdk.sendEmailVerification(user).catch(() => undefined);
				await user.getIdToken(true);
			}),
		resetPassword: (email) => run(() => sdk.sendPasswordResetEmail(auth, email.trim())),
		signOut: () => run(() => sdk.signOut(auth)),
		async idToken(forceRefresh = false) {
			const user = auth.currentUser;
			return user ? user.getIdToken(forceRefresh) : null;
		}
	};
	return { app, auth: port, setup };
}

/** The AuthPort of a build without Firebase: nobody can sign in, the viewer is always null. */
export function unavailableAuth(label = 'Sign-in not configured'): AuthPort {
	const fail = () => Promise.reject(new AuthError('unavailable', MESSAGES.unavailable));
	return {
		available: false,
		label,
		subscribe(listener) {
			listener(null);
			return () => undefined;
		},
		signInWithGoogle: fail,
		signInWithEmail: fail,
		register: fail,
		resetPassword: fail,
		signOut: () => Promise.resolve(),
		idToken: () => Promise.resolve(null)
	};
}
