import { portalView } from '$lib/server/registry';
import { site } from '$lib/site';

// Runs once at build time (the layout marks everything prerendered); the result is baked into index.html.
export function load() {
	const view = portalView();
	return {
		...view,
		links: { registry: site.registryPath, logs: view.gatewayLogsUrl, docs: site.docsUrl }
	};
}
