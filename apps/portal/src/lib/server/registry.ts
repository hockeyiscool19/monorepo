// Build-time access to registry/registry.json — the single source of truth for the platform.
// Lives under $lib/server so the raw registry is never bundled into the client; pages receive
// the view models below through their load functions and the /registry.json endpoint.
import registryJson from '../../../../../registry/registry.json';

export type AppStatus = 'live' | 'beta' | 'planned' | 'hidden';
export type TileStatus = Exclude<AppStatus, 'hidden'>;

export interface AppManifest {
	id: string;
	name: string;
	description: string;
	icon?: string;
	status: AppStatus;
	path: string;
	routing: { mode: 'path-prefix' | 'external'; ready: boolean; note?: string };
	web: {
		kind: 'cloud-run' | 'firebase-hosting' | 'external';
		project?: string;
		region?: string;
		service?: string;
		url: string;
		altUrl?: string;
	};
	api?: { baseUrl: string; healthPath: string; docs?: string; auth?: string };
	repo: { github: string; branch: string; localPath?: string };
	deployment: { version: string; sha: string; imageTag: string; deployedAt: string; deployedBy: 'manual' | 'ci' };
	tags?: string[];
}

export interface Platform {
	domain: string;
	hosting: { project: string; site: string };
	gateway: { enabled: boolean; path: string; service: string; region: string; note?: string };
}

export interface Registry {
	contractVersion: number;
	platform: Platform;
	apps: AppManifest[];
}

/** One rendered tile. `href` is null for planned apps (rendered, dimmed, not clickable). */
export interface TileModel {
	id: string;
	name: string;
	description: string;
	icon: string;
	status: TileStatus;
	href: string | null;
	version: string | null;
}

export type BadgeKind = TileStatus | 'warning';

/** One row of the deployments table. */
export interface DeploymentRow {
	id: string;
	name: string;
	version: string;
	sha: string | null;
	deployedAt: string | null;
	deployedLabel: string;
	badge: { kind: BadgeKind; label: string };
}

export const registry = registryJson as Registry;
export const platform: Platform = registry.platform;

const STATUS_ORDER: Record<AppStatus, number> = { live: 0, beta: 1, planned: 2, hidden: 3 };

/** Apps rendered by the portal: everything but `hidden`, ordered live → beta → planned, then by name. */
export function visibleApps(apps: AppManifest[] = registry.apps): AppManifest[] {
	return apps
		.filter((app) => app.status !== 'hidden')
		.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name, 'en'));
}

/**
 * Where a tile points: its path once routing is verified, the app's own URL until then.
 * The path gets a trailing slash so the request lands on the app's index directly; without it some apps
 * (healthconnect) answer with a redirect to their own Cloud Run host, which would leave the platform domain.
 */
export function tileHref(app: AppManifest): string | null {
	if (app.status === 'planned') return null;
	return app.routing.ready ? `${app.path}/` : app.web.url;
}

export function toTile(app: AppManifest): TileModel {
	return {
		id: app.id,
		name: app.name,
		description: app.description,
		icon: app.icon ?? '',
		status: app.status as TileStatus,
		href: tileHref(app),
		version: app.status === 'planned' ? null : app.deployment.version
	};
}

/** `2026-09-22T18:40:00Z` → `2026-09-22 18:40` (UTC); empty or malformed → `—`. */
export function formatDeployedAt(iso: string): string {
	const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
	return m ? `${m[1]} ${m[2]}` : '—';
}

export function toDeploymentRow(app: AppManifest): DeploymentRow {
	const badge: DeploymentRow['badge'] =
		app.status === 'planned'
			? { kind: 'planned', label: 'Planned' }
			: !app.routing.ready
				? { kind: 'warning', label: 'Routing pending' }
				: app.status === 'beta'
					? { kind: 'beta', label: 'Beta' }
					: { kind: 'live', label: 'Live' };
	return {
		id: app.id,
		name: app.name,
		version: app.deployment.version,
		sha: app.deployment.sha ? app.deployment.sha.slice(0, 7) : null,
		deployedAt: app.deployment.deployedAt || null,
		deployedLabel: formatDeployedAt(app.deployment.deployedAt),
		badge
	};
}

/** Everything the home page needs, computed once at build time. */
export function portalView() {
	const apps = visibleApps();
	const { gateway, hosting } = platform;
	return {
		tiles: apps.map(toTile),
		rows: apps.map(toDeploymentRow),
		routingPending: apps.filter((a) => a.status !== 'planned' && !a.routing.ready).map((a) => a.name),
		liveCount: apps.filter((a) => a.status === 'live').length,
		healthUrl: `${gateway.path}/health`,
		gatewayLogsUrl: `https://console.cloud.google.com/run/detail/${gateway.region}/${gateway.service}/logs?project=${hosting.project}`
	};
}
