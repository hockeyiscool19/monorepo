// Build-time view model of the 3D world: one gate per visible app (same order and links as the tiles) and
// the platform's sign-in block with its group profiles. Lives under $lib/server so the raw registry (with
// each app's private `repo` block) never reaches the client; the world receives only what it draws.
import type { RealmData, RealmGate } from '$lib/world/domain/realm';
import { site } from '$lib/site';
import { platform, tileHref, visibleApps, type AppManifest } from './registry';

export function toGate(app: AppManifest): RealmGate {
	const planned = app.status === 'planned';
	return {
		id: app.id,
		name: app.name,
		description: app.description,
		icon: app.icon ?? '',
		status: app.status === 'hidden' ? 'live' : app.status,
		href: tileHref(app),
		path: app.path,
		version: planned ? null : app.deployment.version,
		sha: planned || !app.deployment.sha ? null : app.deployment.sha.slice(0, 7),
		deployedAt: app.deployment.deployedAt || null,
		access: app.access ? { groups: [...app.access.groups] } : null
	};
}

export function realmData(): RealmData {
	const { auth, gateway, domain } = platform;
	return {
		domain,
		gates: visibleApps().map(toGate),
		auth: auth
			? { enabled: auth.enabled, projectId: auth.projectId, sessionHours: auth.sessionHours, groups: auth.groups.map((g) => ({ ...g })) }
			: null,
		healthUrl: `${gateway.path}/health`,
		registryHref: site.registryPath,
		classicHref: '/apps'
	};
}
