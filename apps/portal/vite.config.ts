/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

// ---- Style switch (one line) -----------------------------------------------------------------
// The folder under plugins/eisen-design/skills that supplies tokens.css (+ components.css).
// 'design-tokens' is the neutral contract, styled by this app's own src/styles/components.css.
// Any other value (e.g. 'ui-style-editorial') uses that skill's tokens.css AND components.css.
// Override without editing: PORTAL_STYLE=ui-style-editorial npm run build
const STYLE = process.env.PORTAL_STYLE || 'ui-style-nordic';
// ----------------------------------------------------------------------------------------------

const repo = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const skill = `plugins/eisen-design/skills/${STYLE}`;

interface RegistryFile {
	platform: { hosting: { site: string }; gateway: { path: string } };
	apps: { path: string; web: { kind: string; url: string }; routing: { ready: boolean }; access?: unknown }[];
}

/**
 * Local runs open every space (realm mode `open`), so every gate must lead somewhere on localhost too:
 * `vite dev` and `vite preview` proxy each app path to the app's own Cloud Run URL (which serves under the
 * same base path), and the gateway path to the published gateway.
 *   REALM_DOOR_URL=http://127.0.0.1:8787   rehearse production: warded apps and /api go through a local gateway
 *   REALM_GATEWAY_URL=<url>                 where /api goes (default: the Hosting site's gateway)
 *   REALM_UPSTREAM_ID_TOKEN=$(gcloud auth print-identity-token)  for apps whose Cloud Run service is private
 */
function realmProxy(env: Record<string, string>): Record<string, ProxyOptions> {
	const registry = JSON.parse(readFileSync(repo('registry/registry.json'), 'utf8')) as RegistryFile;
	const door = env.REALM_DOOR_URL || '';
	const gateway = env.REALM_GATEWAY_URL || door || `https://${registry.platform.hosting.site}.web.app`;
	const token = env.REALM_UPSTREAM_ID_TOKEN || '';
	const proxy: Record<string, ProxyOptions> = {
		[`^${registry.platform.gateway.path}(/|$)`]: { target: gateway, changeOrigin: true, secure: true }
	};
	for (const app of registry.apps) {
		if (app.web.kind !== 'cloud-run' || !app.routing.ready) continue;
		const viaDoor = Boolean(door && app.access);
		proxy[`^${app.path}(/|$)`] = {
			target: viaDoor ? door : app.web.url,
			changeOrigin: true,
			secure: true,
			headers: token && !viaDoor ? { 'x-serverless-authorization': `Bearer ${token}` } : undefined
		};
	}
	return proxy;
}

export default defineConfig(({ mode }) => {
	// PUBLIC_* values may come from the shell (CI) or from apps/portal/.env.local (never committed).
	const env = { ...loadEnv(mode, here('.'), ['PUBLIC_', 'REALM_']), ...process.env } as Record<string, string>;
	const proxy = realmProxy(env);
	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
				},
				adapter: adapter({ strict: true })
			})
		],
		define: {
			// Firebase web config (public by design; see src/lib/world/adapters/firebaseConfig.ts) and the realm override.
			__FIREBASE_WEB__: JSON.stringify({
				apiKey: env.PUBLIC_FIREBASE_API_KEY ?? '',
				appId: env.PUBLIC_FIREBASE_APP_ID ?? '',
				authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
				authEmulatorHost: env.PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? '',
				firestoreEmulatorHost: env.PUBLIC_FIRESTORE_EMULATOR_HOST ?? ''
			}),
			__REALM_MODE__: JSON.stringify(env.PUBLIC_REALM ?? '')
		},
		resolve: {
			alias: {
				'$style/tokens.css': repo(`${skill}/tokens.css`),
				'$style/components.css':
					STYLE === 'design-tokens' ? here('./src/styles/components.css') : repo(`${skill}/components.css`)
			}
		},
		server: {
			// The dev server must be allowed to serve registry/ and plugins/ from outside the app root.
			fs: { allow: [repo('.')] },
			proxy
		},
		preview: { proxy },
		test: {
			include: ['tests/**/*.test.ts'],
			environment: 'node'
		}
	};
});
