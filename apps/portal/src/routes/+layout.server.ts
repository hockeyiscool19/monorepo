import { platform } from '$lib/server/registry';
import { site } from '$lib/site';

// The whole portal is static: every route is prerendered into build/ by adapter-static.
export const prerender = true;

export function load() {
	const { gateway } = platform;
	return {
		domain: platform.domain,
		registryHref: site.registryPath,
		// The gateway's health route only exists once the service is enabled; until then "Status"
		// points at the deployments table so the primary nav never holds a dead link.
		statusHref: gateway.enabled ? `${gateway.path}/health` : '#deployments',
		year: new Date().getUTCFullYear()
	};
}
