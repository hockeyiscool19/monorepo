/**
 * The registry model: contract version 1 of `registry/registry.json` as the portal publishes it
 * at `https://<platform.domain>/registry.json` (the same object plus `generatedAt`).
 * Field meanings follow `registry/schema/registry.schema.json`; this file holds types and pure
 * helpers only. Validation lives in `parseRegistry.ts`.
 */

/** The only registry contract this gateway understands. */
export const CONTRACT_VERSION = 1;

/** How an app is rendered on the portal. `hidden` apps are still routed by the gateway. */
export type AppStatus = "live" | "beta" | "planned" | "hidden";
/** Every valid `status`, in schema order. */
export const APP_STATUSES: readonly AppStatus[] = ["live", "beta", "planned", "hidden"];

/** How the app is reached from the platform domain. */
export type RoutingMode = "path-prefix" | "external";
/** Every valid `routing.mode`. */
export const ROUTING_MODES: readonly RoutingMode[] = ["path-prefix", "external"];

/** Where the app's web UI is hosted. */
export type WebKind = "cloud-run" | "firebase-hosting" | "external";
/** Every valid `web.kind`. */
export const WEB_KINDS: readonly WebKind[] = ["cloud-run", "firebase-hosting", "external"];

/** How the app's API authenticates callers (informational for the gateway). */
export type ApiAuth = "none" | "firebase-id-token" | "cookie" | "api-key";
/** Every valid `api.auth`. */
export const API_AUTHS: readonly ApiAuth[] = ["none", "firebase-id-token", "cookie", "api-key"];

/** Who last wrote the `deployment` block. */
export type DeployedBy = "manual" | "ci";
/** Every valid `deployment.deployedBy`. */
export const DEPLOYED_BY: readonly DeployedBy[] = ["manual", "ci"];

/** `routing` block of an app. */
export interface AppRouting {
  readonly mode: RoutingMode;
  readonly ready: boolean;
  readonly note?: string;
}

/** `web` block of an app: where its UI lives. `url` (and `altUrl`) are CORS origins for the gateway. */
export interface AppWeb {
  readonly kind: WebKind;
  readonly url: string;
  readonly altUrl?: string;
  readonly project?: string;
  readonly region?: string;
  readonly service?: string;
}

/** `api` block of an app: the upstream the gateway forwards `<prefix>/<id>/*` to. */
export interface AppApi {
  readonly baseUrl: string;
  readonly healthPath: string;
  readonly docs?: string;
  readonly auth?: ApiAuth;
}

/** `repo` block of an app. */
export interface AppRepo {
  readonly github: string;
  readonly branch: string;
  readonly localPath?: string;
}

/** `deployment` block of an app, patched by CI on every deploy. */
export interface AppDeployment {
  readonly version: string;
  readonly sha: string;
  readonly imageTag: string;
  readonly deployedAt: string;
  readonly deployedBy: DeployedBy;
}

/** One application entry (`$defs.app` in the schema). */
export interface AppManifest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon?: string;
  readonly status: AppStatus;
  readonly path: string;
  readonly routing: AppRouting;
  readonly web: AppWeb;
  readonly api?: AppApi;
  readonly repo: AppRepo;
  readonly deployment: AppDeployment;
  readonly tags?: readonly string[];
}

/** `platform.hosting`: the Firebase Hosting site that serves the apex domain. */
export interface PlatformHosting {
  readonly project: string;
  readonly site: string;
}

/** `platform.gateway`: where this service is mounted (`path`) and deployed. */
export interface PlatformGateway {
  readonly enabled: boolean;
  readonly path: string;
  readonly service: string;
  readonly region: string;
  readonly note?: string;
}

/** `platform`: the domain and the shared infrastructure. Fields the gateway does not use are optional. */
export interface Platform {
  readonly domain: string;
  readonly hosting?: PlatformHosting;
  readonly gateway?: PlatformGateway;
}

/** The registry envelope, exactly as `GET <prefix>/registry` publishes it. */
export interface Registry {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly generatedAt: string;
  readonly platform?: Platform;
  readonly apps: readonly AppManifest[];
}

/** Apps that expose an API the gateway fronts, in registry order. */
export function appsWithApi(registry: Registry): readonly AppManifest[] {
  return registry.apps.filter((app) => app.api !== undefined);
}

/** The app with the given id, or undefined. Any status counts: hidden apps are still routed. */
export function findApp(registry: Registry, id: string): AppManifest | undefined {
  return registry.apps.find((app) => app.id === id);
}
