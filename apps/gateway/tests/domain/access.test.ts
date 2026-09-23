import { describe, expect, it } from "vitest";
import { decideAccess, doorAppFor, gateLocation, isDoorSessionPath, isHealthExempt, isNavigation } from "../../src/domain/access.js";
import { AccessDeniedError } from "../../src/domain/errors.js";
import { GUARDED_VALE, HEALTHCONNECT, makeApp, makeGuardedRegistry, TOPOLOGY, VALE } from "../fixtures/registry.js";

describe("decideAccess", () => {
  it("lets anyone into an app without an access block", () => {
    expect(decideAccess(VALE, undefined)).toEqual({ allowed: true });
    expect(decideAccess(VALE, [])).toEqual({ allowed: true });
  });

  it("asks for sign-in when nobody is signed in, naming the groups that pass", () => {
    expect(decideAccess(GUARDED_VALE, undefined)).toEqual({ allowed: false, reason: "sign_in_required", groups: ["owner", "vale"] });
    const open = { ...GUARDED_VALE, access: { groups: [] } };
    expect(decideAccess(open, undefined)).toEqual({ allowed: false, reason: "sign_in_required", groups: [] });
  });

  it("admits a person in any one of the groups, anyone signed in for [], and nobody else", () => {
    expect(decideAccess(GUARDED_VALE, ["vale"])).toEqual({ allowed: true });
    expect(decideAccess(GUARDED_VALE, ["other", "owner"])).toEqual({ allowed: true });
    expect(decideAccess({ ...GUARDED_VALE, access: { groups: [] } }, [])).toEqual({ allowed: true });
    expect(decideAccess(GUARDED_VALE, [])).toEqual({ allowed: false, reason: "group_required", groups: ["owner", "vale"] });
    expect(decideAccess(GUARDED_VALE, ["Owner", "vale-circle"])).toEqual({ allowed: false, reason: "group_required", groups: ["owner", "vale"] });
  });
});

describe("where the door sits", () => {
  const registry = makeGuardedRegistry([GUARDED_VALE, HEALTHCONNECT, TOPOLOGY, makeApp({ id: "valet", access: { groups: [] } })]);

  it("finds the guarded app owning a path: its path exactly or anything under it", () => {
    expect(doorAppFor(registry, "/vale")?.id).toBe("vale");
    expect(doorAppFor(registry, "/vale/")?.id).toBe("vale");
    expect(doorAppFor(registry, "/vale/a/b")?.id).toBe("vale");
    expect(doorAppFor(registry, "/valet/x")?.id).toBe("valet");
    for (const path of ["/", "/valeria", "/healthconnect/", "/topology", "/VALE/", "/%76ale/", "/api/vale"]) {
      expect(doorAppFor(registry, path)).toBeUndefined();
    }
  });

  it("recognises exactly <path>/__door/session as the session endpoint", () => {
    expect(isDoorSessionPath(GUARDED_VALE, "/vale/__door/session")).toBe(true);
    for (const path of ["/vale/__door/session/", "/vale/__door", "/vale/x/__door/session", "/__door/session"]) {
      expect(isDoorSessionPath(GUARDED_VALE, path)).toBe(false);
    }
  });

  it("exempts only GET/HEAD of exactly <prefix>/<id><healthPath> from the API policy", () => {
    expect(isHealthExempt(GUARDED_VALE, "GET", "/api/vale/grocery/health", "/api")).toBe(true);
    expect(isHealthExempt(GUARDED_VALE, "head", "/api/vale/grocery/health", "/api")).toBe(true);
    expect(isHealthExempt(GUARDED_VALE, "GET", "/gw/vale/grocery/health", "/gw")).toBe(true);
    expect(isHealthExempt(GUARDED_VALE, "POST", "/api/vale/grocery/health", "/api")).toBe(false);
    expect(isHealthExempt(GUARDED_VALE, "GET", "/api/vale/grocery/health/", "/api")).toBe(false);
    expect(isHealthExempt(GUARDED_VALE, "GET", "/api/vale/health", "/api")).toBe(false);
    expect(isHealthExempt(makeApp({ id: "noapi", access: { groups: [] } }), "GET", "/api/noapi/health", "/api")).toBe(false);
  });

  it("treats GET/HEAD accepting text/html as a page load, and nothing else", () => {
    expect(isNavigation("GET", "text/html,application/xhtml+xml;q=0.9")).toBe(true);
    expect(isNavigation("head", "TEXT/HTML")).toBe(true);
    expect(isNavigation("GET", "application/json")).toBe(false);
    expect(isNavigation("GET", undefined)).toBe(false);
    expect(isNavigation("POST", "text/html")).toBe(false);
  });

  it("sends a refused page load to the portal with the gate and the reason", () => {
    expect(gateLocation("vale", "group_required")).toBe("/?gate=vale&reason=group_required");
  });
});

describe("AccessDeniedError", () => {
  it("attributes a verifier's denial to an app without losing what it knew", () => {
    const original = new AccessDeniedError("sign_in_required", "ID token refused: ERR_JWT_EXPIRED");
    const attributed = original.withDetails({ appId: "vale", groups: ["owner"], endsSession: true });
    expect([attributed.kind, attributed.reason, attributed.appId, attributed.groups, attributed.endsSession]).toEqual([
      "sign_in_required",
      "sign_in_required",
      "vale",
      ["owner"],
      true,
    ]);
    expect(attributed.message).toBe(original.message);
    expect(attributed.cause).toBe(original);
    expect(original.endsSession).toBe(false);
  });
});
