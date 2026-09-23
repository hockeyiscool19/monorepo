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

/** Who issues the platform's identities. */
export type AuthProvider = "firebase";
/** Every valid `platform.auth.provider`. */
export const AUTH_PROVIDERS: readonly AuthProvider[] = ["firebase"];

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

/**
 * `access` block of an app. Present = the app is served only through the gateway door: sign-in is required
 * and the person's `groups` claim must share a group with `groups` ([] = any signed-in person). Absent = public.
 */
export interface AppAccess {
  /** Group ids declared in `platform.auth.groups`. */
  readonly groups: readonly string[];
  readonly note?: string;
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
  /** Who may enter; see AppAccess. Requires `platform.auth` and `web.kind: "cloud-run"`. */
  readonly access?: AppAccess;
  /** Present in the source registry only; published copies omit it (see `toPublicRegistry`). */
  readonly repo?: AppRepo;
  readonly deployment: AppDeployment;
  readonly tags?: readonly string[];
}

/** An app with an `access` block: the door serves it, and its API needs a token that passes the policy. */
export type GuardedApp = AppManifest & { readonly access: AppAccess };

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

/** One of `platform.auth.groups`: the id stored in the `groups` custom claim, and what people see. */
export interface GroupProfile {
  readonly id: string;
  readonly name: string;
  readonly emblem: string;
  readonly description: string;
}

/** `platform.auth`: the platform sign-in (Firebase Authentication in `projectId`) and its group profiles. */
export interface PlatformAuth {
  /** False: the door judges nobody; every guarded app answers door_unconfigured. */
  readonly enabled: boolean;
  readonly provider: AuthProvider;
  /** Issuer of the ID tokens: `aud` is this id, `iss` is https://securetoken.google.com/<projectId>. */
  readonly projectId: string;
  /** Lifetime of a door session, in hours (1–168). */
  readonly sessionHours: number;
  readonly note?: string;
  readonly groups: readonly GroupProfile[];
}

/** `platform`: the domain and the shared infrastructure. Fields the gateway does not use are optional. */
export interface Platform {
  readonly domain: string;
  readonly hosting?: PlatformHosting;
  readonly gateway?: PlatformGateway;
  readonly auth?: PlatformAuth;
}

/** The registry envelope, exactly as `GET <prefix>/registry` publishes it. */
export interface Registry {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly generatedAt: string;
  readonly platform?: Platform;
  readonly apps: readonly AppManifest[];
}

/**
 * The registry as it may be published: every app without its `repo` block, which names private repositories
 * and local checkout paths. The portal's `/registry.json` applies the same rule.
 */
export function toPublicRegistry(registry: Registry): Registry {
  return { ...registry, apps: registry.apps.map(withoutRepo) };
}

function withoutRepo(app: AppManifest): AppManifest {
  const { repo, ...published } = app;
  void repo;
  return published;
}

/** Apps that expose an API the gateway fronts, in registry order. */
export function appsWithApi(registry: Registry): readonly AppManifest[] {
  return registry.apps.filter((app) => app.api !== undefined);
}

/** The app with the given id, or undefined. Any status counts: hidden apps are still routed. */
export function findApp(registry: Registry, id: string): AppManifest | undefined {
  return registry.apps.find((app) => app.id === id);
}

/** True when the app has an `access` block. */
export function isGuarded(app: AppManifest): app is GuardedApp {
  return app.access !== undefined;
}

/** Apps with an `access` block, in registry order. Every status counts: a hidden app is still guarded. */
export function guardedApps(registry: Registry): readonly GuardedApp[] {
  return registry.apps.filter(isGuarded);
}
