import { decideAccess } from "../domain/access.js";
import { AccessDeniedError, type DenialReason } from "../domain/errors.js";
import { bearerToken, type HeaderList } from "../domain/headers.js";
import { guardedApps, type GuardedApp } from "../domain/registry.js";
import type { VerifiedIdentity } from "../domain/session.js";
import type { AccessDeps } from "./door.js";
import type { RegistrySource } from "./ports/RegistrySource.js";

/** What `whoAmI` needs. */
export interface WhoAmIDeps extends AccessDeps {
  readonly registry: RegistrySource;
}

/** The request: only its headers matter (`Authorization: Bearer <Firebase ID token>`). */
export interface WhoAmIRequest {
  readonly headers: HeaderList;
}

/** The signed-in person as the token describes them; absent fields are null. */
export interface WhoAmIUser {
  readonly uid: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly picture: string | null;
  /** How they signed in (`google.com`, `password`, …). */
  readonly provider: string | null;
}

/** Whether the person may pass one guarded app's door right now. `groups` are the ids that pass ([] = anyone signed in). */
export interface GateDecision {
  readonly app: string;
  readonly allowed: boolean;
  /** Only when not allowed: group_required, or door_unconfigured when the door cannot open for anyone. */
  readonly reason?: DenialReason;
  readonly groups: readonly string[];
}

/** The body of `GET <prefix>/auth/me`. */
export interface WhoAmIResult {
  readonly user: WhoAmIUser;
  /** The person's `groups` claim. */
  readonly groups: readonly string[];
  /** One decision per app with an `access` block, in registry order. */
  readonly access: readonly GateDecision[];
}

function gateDecision(deps: AccessDeps, app: GuardedApp, identity: VerifiedIdentity): GateDecision {
  const groups = app.access.groups;
  if (deps.mode === "open") return { app: app.id, allowed: true, groups };
  if (deps.sealer === undefined) return { app: app.id, allowed: false, reason: "door_unconfigured", groups };
  const decision = decideAccess(app, identity.groups);
  return decision.allowed ? { app: app.id, allowed: true, groups } : { app: app.id, allowed: false, reason: decision.reason, groups };
}

/**
 * Use case: who the bearer of a Firebase ID token is, and which guarded apps they may enter right now — the same
 * verdicts the door would give (ACCESS_MODE=open: every gate open; no SESSION_SECRET: door_unconfigured).
 * Rejects with AccessDeniedError: sign_in_required without a token (whatever the registry says, so a deploy smoke
 * test gets its 401 before the registry with sign-in is published) or with a refused one; door_unconfigured when a
 * token arrives but the registry has no enabled `platform.auth` to check it against. Also rejects with
 * UpstreamError when Google's keys cannot be fetched, and with the RegistrySource errors.
 */
export async function whoAmI(deps: WhoAmIDeps, request: WhoAmIRequest): Promise<WhoAmIResult> {
  const token = bearerToken(request.headers);
  if (token === undefined) throw new AccessDeniedError("sign_in_required", "no bearer token");
  const registry = await deps.registry.load();
  const auth = registry.platform?.auth;
  if (auth === undefined || !auth.enabled) throw new AccessDeniedError("door_unconfigured", "platform sign-in is missing or disabled");
  const identity = await deps.verifier.verify({ token, projectId: auth.projectId });
  return {
    user: {
      uid: identity.uid,
      email: identity.email ?? null,
      emailVerified: identity.emailVerified,
      name: identity.name ?? null,
      picture: identity.picture ?? null,
      provider: identity.provider ?? null,
    },
    groups: identity.groups,
    access: guardedApps(registry).map((app) => gateDecision(deps, app, identity)),
  };
}
