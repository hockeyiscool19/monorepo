import { describe, expect, it } from "vitest";
import {
  applyAppCookie,
  cookieMaxAge,
  isSessionLive,
  liveAppPart,
  parseEnvelope,
  startSession,
  type Envelope,
} from "../../src/domain/session.js";
import { MEMBER, NOW, OWNER } from "../fixtures/access.js";

const session = startSession(OWNER, NOW, 12);

describe("startSession", () => {
  it("keeps who signed in, their groups and a sessionHours lifetime; no picture, no provider", () => {
    expect(session).toEqual({ uid: "uid-owner", email: "owner@example.test", name: "Owner", groups: ["owner"], iat: NOW, exp: NOW + 43_200 });
    expect(startSession(MEMBER, NOW, 1)).toEqual({ uid: "uid-member", groups: ["vale"], iat: NOW, exp: NOW + 3600 });
  });
});

describe("isSessionLive", () => {
  it("is live from iat until exp", () => {
    expect(isSessionLive(session, NOW, 12)).toBe(true);
    expect(isSessionLive(session, NOW + 43_199, 12)).toBe(true);
    expect(isSessionLive(session, NOW + 43_200, 12)).toBe(false);
  });

  it("ends earlier when the registry's sessionHours is now shorter, never later when it is longer", () => {
    expect(isSessionLive(session, NOW + 3599, 1)).toBe(true);
    expect(isSessionLive(session, NOW + 3600, 1)).toBe(false);
    expect(isSessionLive(session, NOW + 43_200, 168)).toBe(false);
  });

  it("refuses a session issued in the future beyond a minute of instance skew", () => {
    expect(isSessionLive({ ...session, iat: NOW + 60 }, NOW, 12)).toBe(true);
    expect(isSessionLive({ ...session, iat: NOW + 61 }, NOW, 12)).toBe(false);
  });
});

describe("the app part", () => {
  it("is in force until its own expiry; a browser-session cookie (ax null) until the envelope goes", () => {
    const envelope: Envelope = { p: session, a: "state", ax: NOW + 10 };
    expect(liveAppPart(envelope, NOW + 9)).toEqual({ a: "state", ax: NOW + 10 });
    expect(liveAppPart(envelope, NOW + 10)).toEqual({ a: null, ax: null });
    expect(liveAppPart({ p: session, a: "state", ax: null }, NOW + 99_999)).toEqual({ a: "state", ax: null });
    expect(liveAppPart({ p: session, a: null, ax: null }, NOW)).toEqual({ a: null, ax: null });
  });

  it("follows the app's Set-Cookie: replaced, expiring, session-only or deleted", () => {
    expect(applyAppCookie({ name: "__session", value: "v", maxAge: 60 }, NOW)).toEqual({ a: "v", ax: NOW + 60 });
    expect(applyAppCookie({ name: "__session", value: "v", expires: NOW + 5 }, NOW)).toEqual({ a: "v", ax: NOW + 5 });
    expect(applyAppCookie({ name: "__session", value: "v" }, NOW)).toEqual({ a: "v", ax: null });
    expect(applyAppCookie({ name: "__session", value: "v", maxAge: 0 }, NOW)).toEqual({ a: null, ax: null });
    expect(applyAppCookie({ name: "__session", value: "", maxAge: 60 }, NOW)).toEqual({ a: null, ax: null });
  });
});

describe("cookieMaxAge", () => {
  it("lasts until the later of the session's exp and the app cookie's expiry, and at least 60 seconds", () => {
    expect(cookieMaxAge({ p: session, a: null, ax: null }, NOW)).toBe(43_200);
    expect(cookieMaxAge({ p: session, a: "x", ax: NOW + 86_400 }, NOW)).toBe(86_400);
    expect(cookieMaxAge({ p: session, a: "x", ax: NOW + 60 }, NOW)).toBe(43_200);
    expect(cookieMaxAge({ p: session, a: null, ax: null }, NOW + 43_190)).toBe(60);
    expect(cookieMaxAge({ p: null, a: "x", ax: null }, NOW)).toBe(60);
  });
});

describe("parseEnvelope", () => {
  it("accepts the envelope's shape, with or without optional fields", () => {
    const envelope: Envelope = { p: session, a: "x", ax: NOW };
    expect(parseEnvelope(JSON.parse(JSON.stringify(envelope)))).toEqual(envelope);
    expect(parseEnvelope({ p: null, a: null, ax: null })).toEqual({ p: null, a: null, ax: null });
    expect(parseEnvelope({ p: { uid: "u", groups: [], iat: 1, exp: 2, extra: true }, a: null, ax: null })).toEqual({
      p: { uid: "u", groups: [], iat: 1, exp: 2 },
      a: null,
      ax: null,
    });
  });

  it("refuses anything else", () => {
    const p = { uid: "u", groups: [], iat: 1, exp: 2 };
    for (const value of [
      null,
      [],
      "x",
      {},
      { p, a: null },
      { p, a: 1, ax: null },
      { p, a: null, ax: "soon" },
      { p: { ...p, uid: "" }, a: null, ax: null },
      { p: { ...p, uid: 7 }, a: null, ax: null },
      { p: { ...p, groups: "owner" }, a: null, ax: null },
      { p: { ...p, groups: [1] }, a: null, ax: null },
      { p: { ...p, exp: undefined }, a: null, ax: null },
      { p: { ...p, iat: Number.NaN }, a: null, ax: null },
      { p: { ...p, email: 5 }, a: null, ax: null },
    ]) {
      expect(parseEnvelope(value)).toBeUndefined();
    }
  });
});
