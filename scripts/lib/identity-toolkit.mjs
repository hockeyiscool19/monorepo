// A minimal Identity Toolkit v1 client (the Firebase Authentication admin REST API) for scripts/grant-groups.mjs.
// Zero dependencies; `fetch` is injected so tests never touch the network.
//
//   production: https://identitytoolkit.googleapis.com/v1 with `Authorization: Bearer <OAuth access token>` and
//               `x-goog-user-project: <projectId>` (a gcloud user token needs a quota project)
//   emulator:   http://<host:port>/identitytoolkit.googleapis.com/v1 with `Authorization: Bearer owner` (admin)
// Calls: POST projects/<p>/accounts:lookup · POST projects/<p>/accounts:update · GET projects/<p>/accounts:batchGet.
// Error messages carry the method, the call and Google's error status, never a header or a token.

export const PRODUCTION_BASE = "https://identitytoolkit.googleapis.com/v1";
export const DEFAULT_EMULATOR_HOST = "127.0.0.1:9099";
export const PAGE_SIZE = 500;
const TIMEOUT_MS = 20_000;

/** Where to call and with which headers. `accessToken` is required for production and ignored for the emulator. */
export function connection({ projectId, emulatorHost, accessToken }) {
  if (emulatorHost) {
    return {
      base: `http://${emulatorHost}/identitytoolkit.googleapis.com/v1`,
      headers: { authorization: "Bearer owner" },
      label: `emulator ${emulatorHost}`,
    };
  }
  if (!accessToken) throw new Error("an access token is required for production");
  return {
    base: PRODUCTION_BASE,
    headers: { authorization: `Bearer ${accessToken}`, "x-goog-user-project": projectId },
    label: "production",
  };
}

/** A failed call: `status` is the HTTP status, `reason` Google's error message (e.g. USER_NOT_FOUND). */
export class IdentityToolkitError extends Error {
  constructor(what, status, reason) {
    super(`Identity Toolkit ${what} → ${status}${reason ? ` ${reason}` : ""}`);
    this.status = status;
    this.reason = reason;
  }
}

/** lookup / update / listPage bound to one project and connection. */
export function identityToolkit({ fetch, projectId, conn }) {
  const account = `${conn.base}/projects/${encodeURIComponent(projectId)}/accounts`;

  async function call(method, url, what, body) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { ...conn.headers, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const why = err?.name === "TimeoutError" ? `no answer in ${TIMEOUT_MS / 1000} s` : (err?.cause?.code ?? err?.message ?? String(err));
      throw new IdentityToolkitError(what, "unreachable", `(${why}${conn.label.startsWith("emulator") ? "; is the Auth emulator running?" : ""})`);
    }
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const reason = json?.error?.message ?? json?.error?.status ?? text.slice(0, 120).replace(/\s+/g, " ");
      throw new IdentityToolkitError(what, res.status, reason);
    }
    if (json === undefined) throw new IdentityToolkitError(what, res.status, "answer is not JSON");
    return json;
  }

  return {
    /** Accounts matching one email or one uid: [] when there is none. */
    async lookup({ email, uid }) {
      const body = email !== undefined ? { email: [email] } : { localId: [uid] };
      const json = await call("POST", `${account}:lookup`, "accounts:lookup", body);
      return Array.isArray(json.users) ? json.users : [];
    },
    /** Replace the account's custom claims with `customAttributes` (a JSON object string). */
    async update(localId, customAttributes) {
      await call("POST", `${account}:update`, "accounts:update", { localId, customAttributes });
    },
    /** One page of accounts: {users, nextPageToken}. */
    async listPage(pageToken) {
      const query = new URLSearchParams({ maxResults: String(PAGE_SIZE) });
      if (pageToken) query.set("nextPageToken", pageToken);
      const json = await call("GET", `${account}:batchGet?${query}`, "accounts:batchGet");
      return { users: Array.isArray(json.users) ? json.users : [], nextPageToken: json.nextPageToken || undefined };
    },
  };
}
