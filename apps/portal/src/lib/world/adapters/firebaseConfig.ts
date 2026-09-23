// Where the Firebase web configuration comes from. The web config is public by design (it names the
// project; security lives in Auth, the door and Firestore rules), but it still is not written in the repo:
//   1. the Auth emulator, when PUBLIC_FIREBASE_AUTH_EMULATOR_HOST is set at build time (local rehearsal);
//   2. PUBLIC_FIREBASE_API_KEY + PUBLIC_FIREBASE_APP_ID at build time (CI repository variables);
//   3. Firebase Hosting's reserved /__/firebase/init.json, on the real domains (the site lives in the auth project);
//   4. otherwise none — sign-in is unavailable and warded gates stay sealed (fail closed).

import { isLocalHost } from '../domain/mode';

export interface FirebaseWebConfig {
	apiKey: string;
	authDomain: string;
	projectId: string;
	appId: string;
}

export interface FirebaseSetup {
	config: FirebaseWebConfig;
	authEmulatorHost: string | null;
	firestoreEmulatorHost: string | null;
	source: 'emulator' | 'build' | 'hosting';
}

/** Build-time values injected by vite.config.ts (`define: { __FIREBASE_WEB__ }`). Empty strings mean unset. */
export interface FirebaseBuildValues {
	apiKey: string;
	appId: string;
	authDomain: string;
	authEmulatorHost: string;
	firestoreEmulatorHost: string;
}

export interface PageLocation {
	hostname: string;
	/** hostname:port */
	host: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The auth handler must be same-origin to avoid third-party-storage trouble (Safari, Chrome's partitioning).
 * Firebase Hosting serves /__/auth/* on every domain of the site, so on the real domains authDomain is the page's
 * own host; locally it falls back to the project's firebaseapp.com.
 */
export function authDomainFor(projectId: string, location: PageLocation, explicit = ''): string {
	if (explicit) return explicit;
	return isLocalHost(location.hostname) ? `${projectId}.firebaseapp.com` : location.host;
}

export async function resolveFirebase(
	projectId: string,
	location: PageLocation,
	build: FirebaseBuildValues,
	fetchFn: FetchLike
): Promise<FirebaseSetup | null> {
	const emulators = {
		authEmulatorHost: build.authEmulatorHost || null,
		firestoreEmulatorHost: build.firestoreEmulatorHost || null
	};
	if (build.authEmulatorHost) {
		return {
			config: {
				apiKey: build.apiKey || 'demo-api-key',
				authDomain: build.authDomain || `${projectId}.firebaseapp.com`,
				projectId,
				appId: build.appId || 'demo-app-id'
			},
			...emulators,
			source: 'emulator'
		};
	}
	if (build.apiKey && build.appId) {
		return {
			config: { apiKey: build.apiKey, appId: build.appId, projectId, authDomain: authDomainFor(projectId, location, build.authDomain) },
			...emulators,
			source: 'build'
		};
	}
	if (isLocalHost(location.hostname)) return null;
	try {
		const res = await fetchFn('/__/firebase/init.json', { cache: 'no-store', headers: { accept: 'application/json' } });
		if (!res.ok) return null;
		const body = (await res.json()) as Partial<FirebaseWebConfig>;
		// Only trust Hosting's config when it names the project the registry says the platform uses.
		if (body.projectId !== projectId || !body.apiKey || !body.appId) return null;
		return {
			config: { apiKey: body.apiKey, appId: body.appId, projectId, authDomain: authDomainFor(projectId, location) },
			...emulators,
			source: 'hosting'
		};
	} catch {
		return null;
	}
}
