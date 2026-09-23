/**
 * buildApp — the composition root. Lives in adapters/inbound/bootstrap.ts. The ONLY module that
 * constructs adapters. Every argument is optional: main.ts calls buildApp(settingsFromEnv(process.env));
 * tests call buildApp(undefined, new FakeRegistrySource(...)) and never touch the network. Domain errors
 * map to HTTP here, once. The returned fetch handler is what Hono's `serve({ fetch })`, Bun, Deno and
 * Workers accept. RegistryService (application/registry/service.ts) takes the port in its constructor.
 */
import type { RegistrySource } from '../../application/ports/registry-source';
import { RegistryService } from '../../application/registry/service';
import { AppError, ContractError, InvalidRequestError, NotFoundError, UpstreamError } from '../../domain/errors';
import { HttpRegistrySource } from '../outbound/http-registry-source';

export type Settings = { readonly registryUrl: string };
export type App = { readonly fetch: (request: Request) => Promise<Response> };

const HTTP_STATUS: ReadonlyMap<unknown, number> = new Map<unknown, number>([
  [InvalidRequestError, 400], [NotFoundError, 404], [UpstreamError, 502], [ContractError, 502],
]);

/** Environment variables are read here and nowhere else (APP_REGISTRY_URL). */
export function settingsFromEnv(env: Readonly<Record<string, string | undefined>>): Settings {
  return { registryUrl: env['APP_REGISTRY_URL'] ?? 'https://eisensoftware.com' };
}

export function buildApp(settings: Settings = settingsFromEnv({}), registry?: RegistrySource): App {
  const service = new RegistryService(registry ?? new HttpRegistrySource({ baseUrl: settings.registryUrl }));
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      try {
        if (request.method !== 'GET' || url.pathname !== '/api/registry') throw new NotFoundError(`no route for ${url.pathname}`);
        return Response.json(await service.load({ includeHidden: url.searchParams.get('include_hidden') === 'true' }));
      } catch (error) {
        if (!(error instanceof AppError)) return Response.json({ code: 'internal_error', message: 'unexpected failure' }, { status: 500 });
        return Response.json({ code: error.code, message: error.message }, { status: HTTP_STATUS.get(error.constructor) ?? 500 });
      }
    },
  };
}
