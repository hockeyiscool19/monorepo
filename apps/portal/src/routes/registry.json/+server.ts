import { json } from '@sveltejs/kit';
import { registry } from '$lib/server/registry';

// Prerendered to build/registry.json: the registry object (platform + every app, hidden ones
// included) plus the build timestamp. The gateway and firebase.json are rendered from the same source.
export const prerender = true;

export function GET() {
	const { contractVersion, ...rest } = registry;
	return json({ contractVersion, generatedAt: new Date().toISOString(), ...rest });
}
