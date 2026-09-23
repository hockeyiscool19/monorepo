// Realm mode: `open` when Eisenhold runs locally (every gate and space open, no sign-in),
// `guarded` everywhere else. Pure: the caller passes the location and build flags.

import type { RealmMode } from './access';

export interface ModeInput {
	hostname: string;
	/** `location.search`, e.g. `?realm=guarded`. */
	search: string;
	/** True under `vite dev`. */
	dev: boolean;
	/** Build-time override (`PUBLIC_REALM=guarded` rehearses production locally). Empty = none. */
	override: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** True for loopback hosts and `*.localhost`. */
export function isLocalHost(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
}

/**
 * `?realm=guarded` (or the build override) forces guarded mode anywhere, so the production experience can be
 * rehearsed locally. Nothing can open a non-local host: `?realm=open` is ignored there.
 */
export function realmMode(input: ModeInput): RealmMode {
	const asked = new URLSearchParams(input.search).get('realm') ?? input.override;
	if (asked === 'guarded') return 'guarded';
	// `vite dev` is local by definition, even when opened from another device on the LAN.
	return input.dev || isLocalHost(input.hostname) ? 'open' : 'guarded';
}
