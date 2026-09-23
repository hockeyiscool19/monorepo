import { defineConfig } from "vitest/config";

// Tests use fakes only: no network, no real upstreams, no registry fetch.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
