/**
 * Process entry point: build the app from the environment and serve it on PORT (8080).
 * Cloud Run sends SIGTERM before stopping an instance; in-flight requests get five seconds.
 */

import { serve } from "@hono/node-server";
import { buildApp } from "./adapters/inbound/bootstrap.js";

const { app, settings, log } = buildApp();

const server = serve({ fetch: app.fetch, port: settings.port }, (info) => {
  log.info("gateway listening", {
    port: info.port,
    version: settings.gatewayVersion,
    apiPrefix: settings.apiPrefix,
    registry: settings.registryFile ?? settings.registryUrl,
  });
});

function shutdown(signal: string): void {
  log.info("shutting down", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
