import type { UpstreamCredentials } from "../../../application/ports/UpstreamCredentials.js";
import type { HeaderList } from "../../../domain/headers.js";

/** UpstreamCredentials that add nothing: UPSTREAM_AUTH=none (local runs, or while the upstream still allows allUsers). */
export class NoUpstreamCredentials implements UpstreamCredentials {
  async headersFor(): Promise<HeaderList> {
    return [];
  }
}
