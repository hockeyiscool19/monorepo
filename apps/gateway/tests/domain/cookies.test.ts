import { describe, expect, it } from "vitest";
import {
  clearedDoorCookie,
  cookieEffect,
  isLoopbackHost,
  parseCookieHeader,
  parseSetCookie,
  secureCookieFor,
  serializeCookiePairs,
  serializeDoorCookie,
} from "../../src/domain/cookies.js";

describe("parseCookieHeader and serializeCookiePairs", () => {
  it("keep every pair in order, duplicates included, and round-trip", () => {
    const header = "__session=d1.a.b; theme=dark;__session=raw ; empty=; x=a=b; lonely";
    const pairs = parseCookieHeader(header);
    expect(pairs).toEqual([
      { name: "__session", value: "d1.a.b" },
      { name: "theme", value: "dark" },
      { name: "__session", value: "raw" },
      { name: "empty", value: "" },
      { name: "x", value: "a=b" },
      { name: "", value: "lonely" },
    ]);
    expect(serializeCookiePairs(pairs)).toBe("__session=d1.a.b; theme=dark; __session=raw; empty=; x=a=b; lonely");
    expect(parseCookieHeader(" ; ;")).toEqual([]);
    expect(serializeCookiePairs([])).toBe("");
  });
});

describe("parseSetCookie", () => {
  it("reads the name, the value, Max-Age and Expires (in Unix seconds), case-insensitively", () => {
    expect(parseSetCookie("__session=abc; Path=/vale; HttpOnly; Secure")).toEqual({ name: "__session", value: "abc" });
    expect(parseSetCookie("__session=abc; max-age=60")).toEqual({ name: "__session", value: "abc", maxAge: 60 });
    expect(parseSetCookie("a=1; EXPIRES=Wed, 21 Oct 2015 07:28:00 GMT")).toEqual({ name: "a", value: "1", expires: 1_445_412_480 });
    expect(parseSetCookie(' q = "quoted value" ')).toEqual({ name: "q", value: '"quoted value"' });
  });

  it("lets the last Max-Age win, and ignores malformed attributes as browsers do", () => {
    expect(parseSetCookie("a=1; Max-Age=10; Max-Age=-1")).toMatchObject({ maxAge: -1 });
    expect(parseSetCookie("a=1; Max-Age=soon; Expires=never")).toEqual({ name: "a", value: "1" });
    expect(parseSetCookie("a=1; Max-Age=1.5")).toEqual({ name: "a", value: "1" });
  });

  it("returns undefined for a line without a named pair", () => {
    expect(parseSetCookie("novalue")).toBeUndefined();
    expect(parseSetCookie("=value")).toBeUndefined();
    expect(parseSetCookie("")).toBeUndefined();
  });
});

describe("cookieEffect", () => {
  const now = 1_700_000_000;
  it("deletes for an empty value, Max-Age ≤ 0 or a past Expires; Max-Age wins over Expires", () => {
    expect(cookieEffect({ name: "a", value: "" }, now)).toEqual({ deleted: true });
    expect(cookieEffect({ name: "a", value: "v", maxAge: 0 }, now)).toEqual({ deleted: true });
    expect(cookieEffect({ name: "a", value: "v", expires: now }, now)).toEqual({ deleted: true });
    expect(cookieEffect({ name: "a", value: "v", maxAge: 5, expires: now - 10 }, now)).toEqual({ deleted: false, expiresAt: now + 5 });
    expect(cookieEffect({ name: "a", value: "v", expires: now + 9 }, now)).toEqual({ deleted: false, expiresAt: now + 9 });
    expect(cookieEffect({ name: "a", value: "v" }, now)).toEqual({ deleted: false, expiresAt: null });
  });
});

describe("the door's own cookie", () => {
  it("is __session scoped to the app's path, HttpOnly, SameSite=Lax, and Secure unless told otherwise", () => {
    expect(serializeDoorCookie({ value: "d1.x.y", path: "/vale", maxAge: 120, secure: true })).toBe(
      "__session=d1.x.y; Path=/vale; Max-Age=120; HttpOnly; SameSite=Lax; Secure",
    );
    expect(serializeDoorCookie({ value: "d1.x.y", path: "/vale", maxAge: 120, secure: false })).toBe(
      "__session=d1.x.y; Path=/vale; Max-Age=120; HttpOnly; SameSite=Lax",
    );
    expect(clearedDoorCookie("/vale", true)).toBe("__session=; Path=/vale; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
  });

  it("drops Secure only for plain http to a loopback host", () => {
    for (const host of ["localhost", "LOCALHOST", "app.localhost", "127.0.0.1", "127.8.9.10", "::1", "[::1]"]) {
      expect(isLoopbackHost(host)).toBe(true);
    }
    for (const host of ["localhost.example.com", "128.0.0.1", "10.0.0.1", "::2", "eisensoftware.com", "127.0.0.1.nip.io"]) {
      expect(isLoopbackHost(host)).toBe(false);
    }
    expect(secureCookieFor("http://localhost:8787/vale/")).toBe(false);
    expect(secureCookieFor("http://[::1]/vale/")).toBe(false);
    expect(secureCookieFor("https://localhost/vale/")).toBe(true);
    expect(secureCookieFor("http://gateway-abc.a.run.app/vale/")).toBe(true);
    expect(secureCookieFor("not a url")).toBe(true);
  });
});
