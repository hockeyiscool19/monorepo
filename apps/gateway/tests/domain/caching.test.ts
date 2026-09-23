import { describe, expect, it } from "vitest";
import { addVary, privateCacheControl, withPrivateCaching, withVary } from "../../src/domain/caching.js";

describe("privateCacheControl", () => {
  it("keeps max-age, immutable, no-cache, no-store and must-revalidate behind private", () => {
    expect(privateCacheControl(["public, max-age=31536000, immutable"])).toBe("private, max-age=31536000, immutable");
    expect(privateCacheControl(["no-cache, must-revalidate"])).toBe("private, no-cache, must-revalidate");
    expect(privateCacheControl(["private, no-store"])).toBe("private, no-store");
    expect(privateCacheControl(["Max-Age=60", "NO-CACHE"])).toBe("private, max-age=60, no-cache");
  });

  it("drops public, s-maxage and every other directive; a field-named no-cache becomes a bare one", () => {
    expect(privateCacheControl(["public, s-maxage=600, max-age=60, stale-while-revalidate=30, proxy-revalidate"])).toBe(
      "private, max-age=60",
    );
    expect(privateCacheControl(['no-cache="set-cookie", max-age=5'])).toBe("private, no-cache, max-age=5");
    expect(privateCacheControl(["max-age=60, max-age=0"])).toBe("private, max-age=60");
  });

  it("is private, no-store when the upstream sent nothing usable", () => {
    expect(privateCacheControl([])).toBe("private, no-store");
    expect(privateCacheControl(["public"])).toBe("private, no-store");
    expect(privateCacheControl(["public, s-maxage=600"])).toBe("private, no-store");
    expect(privateCacheControl(['max-age="60"', "max-age="])).toBe("private, no-store");
  });
});

describe("withPrivateCaching and withVary", () => {
  it("replace every Cache-Control with one private value, and merge every Vary into one that names the field", () => {
    expect(withPrivateCaching([["Cache-Control", "public"], ["x-a", "1"], ["cache-control", "max-age=9"]])).toEqual([
      ["x-a", "1"],
      ["cache-control", "private, max-age=9"],
    ]);
    expect(withVary([["vary", "Accept"], ["x-a", "1"], ["Vary", "Origin"]], "Authorization")).toEqual([
      ["x-a", "1"],
      ["vary", "Accept, Origin, Authorization"],
    ]);
    expect(withVary([], "Cookie")).toEqual([["vary", "Cookie"]]);
  });

  it("addVary leaves a Vary alone when it already names the field or is *", () => {
    expect(addVary(undefined, "Cookie")).toBe("Cookie");
    expect(addVary("Accept-Encoding", "Cookie")).toBe("Accept-Encoding, Cookie");
    expect(addVary("accept-encoding, cookie", "Cookie")).toBe("accept-encoding, cookie");
    expect(addVary("*", "Cookie")).toBe("*");
    expect(addVary(" , ", "Cookie")).toBe("Cookie");
  });
});
