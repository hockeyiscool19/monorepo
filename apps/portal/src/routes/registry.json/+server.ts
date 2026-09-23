import { json } from '@sveltejs/kit';
import { registry, type AppManifest } from '$lib/server/registry';

// Prerendered to build/registry.json: the registry object (platform + every app, hidden ones
// included) plus the build timestamp. The gateway and firebase.json are rendered from the same source.
// Each app's `repo` block names private repositories and local checkout paths, so the public copy omits it;
// `node scripts/validate-registry.mjs --published build/registry.json` enforces that.
export const prerender = true;

function publicApp(app: AppManifest): Omit<AppManifest, 'repo'> {
	const copy: Partial<AppManifest> = { ...app };
	delete copy.repo;
	return copy as Omit<AppManifest, 'repo'>;
}

export function GET() {
	const { contractVersion, platform, apps } = registry;
	return json({ contractVersion, generatedAt: new Date().toISOString(), platform, apps: apps.map(publicApp) });
}
