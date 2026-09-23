/**
 * The access policy of apps with an `access` block, and where the door sits: which paths belong to a guarded
 * app, its session endpoint, the one API route that stays public, and what counts as a page navigation.
 * Pure: the policy is re-evaluated against the registry of the request, every time.
 */

import type { DenialReason } from "./errors.js";
import { guardedApps, type AppManifest, type GuardedApp, type Registry } from "./registry.js";

/** ACCESS_MODE: `enforce` applies the policy; `open` lets every request through (local development only). */
export type AccessMode = "enforce" | "open";
/** Every valid ACCESS_MODE. */
export const ACCESS_MODES: readonly AccessMode[] = ["enforce", "open"];

/** The policy's verdict for one person and one app. `groups` lists the ids that would pass ([] = anyone signed in). */
export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "sign_in_required" | "group_required"; readonly groups: readonly string[] };

/**
 * Decide whether a person may enter `app`. `groups` is the person's `groups` claim, or undefined when nobody is
 * signed in. An app without `access` is public; `access.groups: []` admits any signed-in person; otherwise the
 * person needs at least one of the listed groups.
 */
export function decideAccess(app: AppManifest, groups: readonly string[] | undefined): AccessDecision {
  if (app.access === undefined) return { allowed: true };
  const required = app.access.groups;
  if (groups === undefined) return { allowed: false, reason: "sign_in_required", groups: required };
  if (required.length === 0 || required.some((group) => groups.includes(group))) return { allowed: true };
  return { allowed: false, reason: "group_required", groups: required };
}

/** The door's own endpoint, under the app's path: POST signs a browser in, DELETE signs it out. */
export const DOOR_SESSION_SUFFIX = "/__door/session";

/** The guarded app whose path owns `pathname` (`/vale` or anything under `/vale/`), or undefined. */
export function doorAppFor(registry: Registry, pathname: string): GuardedApp | undefined {
  return guardedApps(registry).find((app) => pathname === app.path || pathname.startsWith(`${app.path}/`));
}

/** True for exactly `<app.path>/__door/session`, which the door answers itself and never forwards. */
export function isDoorSessionPath(app: AppManifest, pathname: string): boolean {
  return pathname === `${app.path}${DOOR_SESSION_SUFFIX}`;
}

/**
 * True for the one API request of a guarded app that needs no token: GET or HEAD of exactly
 * `<prefix>/<id><api.healthPath>` (the path as sent, so encoded or dotted variants do not match).
 */
export function isHealthExempt(app: AppManifest, method: string, pathname: string, prefix: string): boolean {
  if (app.api === undefined) return false;
  const verb = method.toUpperCase();
  return (verb === "GET" || verb === "HEAD") && pathname === `${prefix}/${app.id}${app.api.healthPath}`;
}

/** A page load: GET or HEAD whose Accept names text/html. A denied navigation is sent back to the portal. */
export function isNavigation(method: string, accept: string | undefined): boolean {
  const verb = method.toUpperCase();
  return (verb === "GET" || verb === "HEAD") && accept !== undefined && accept.toLowerCase().includes("text/html");
}

/** Where a denied navigation goes: the portal, told which gate refused and why. */
export function gateLocation(appId: string, reason: DenialReason): string {
  return `/?gate=${encodeURIComponent(appId)}&reason=${reason}`;
}
