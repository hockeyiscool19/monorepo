/**
 * Frozen wire types for the registry port. Lives in domain/contract.ts. CONTRACT_VERSION changes on a
 * breaking change only; results carry it so a consumer can refuse a payload it does not understand. Every
 * type is readonly; JSON is parsed into the contract at the boundary by parseLoadRegistryResult (or zod).
 */
export const CONTRACT_VERSION = 1 as const;

export type AppStatus = 'live' | 'beta' | 'hidden';

export type AppEntry = {
  readonly id: string;
  readonly path: string;
  readonly status: AppStatus;
  readonly version: string | null;
};

/** The one argument of RegistrySource.load. Add fields here, never parameters there. */
export type LoadRegistryRequest = { readonly includeHidden: boolean };

/** The one return value of RegistrySource.load; identical from HTTP, file or fake. */
export type LoadRegistryResult = {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly apps: readonly AppEntry[];
};

const ID = /^[a-z][a-z0-9-]*$/;
const STATUSES: readonly string[] = ['live', 'beta', 'hidden'];

/** Returns the validated, frozen result, or null when the payload is not contract v1. */
export function parseLoadRegistryResult(input: unknown): LoadRegistryResult | null {
  const raw = input as { readonly contractVersion?: unknown; readonly apps?: unknown } | null;
  if (raw === null || typeof raw !== 'object' || raw.contractVersion !== CONTRACT_VERSION || !Array.isArray(raw.apps)) return null;
  const apps: AppEntry[] = [];
  for (const { id, path, status, version } of raw.apps as ReadonlyArray<Record<string, unknown>>) {
    if (typeof id !== 'string' || !ID.test(id) || typeof path !== 'string' || !path.startsWith('/')) return null;
    if (typeof status !== 'string' || !STATUSES.includes(status) || (version != null && typeof version !== 'string')) return null;
    apps.push({ id, path, status: status as AppStatus, version: version ?? null });
  }
  return Object.freeze({ contractVersion: CONTRACT_VERSION, apps: Object.freeze(apps) });
}
