// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	/** Build-time Firebase web config and emulator hosts (vite.config.ts `define`); empty strings mean unset. */
	const __FIREBASE_WEB__: {
		apiKey: string;
		appId: string;
		authDomain: string;
		authEmulatorHost: string;
		firestoreEmulatorHost: string;
	};
	/** Build-time realm override: `guarded` rehearses production locally; empty = decide from the host. */
	const __REALM_MODE__: string;
}

export {};
