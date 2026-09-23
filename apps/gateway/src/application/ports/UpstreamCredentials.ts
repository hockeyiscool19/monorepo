import type { HeaderList } from "../../domain/headers.js";

/** The upstream URL a request is about to be sent to. */
export interface CredentialsRequest {
  readonly url: string;
}

/**
 * Outbound port: headers that prove the gateway's own identity to a guarded app's upstream (Cloud Run IAM,
 * so the service can stop allowing `allUsers`). Used only for apps with an `access` block.
 *
 * `headersFor()` resolves with the headers to add, possibly none. It rejects with UpstreamError when
 * credentials are configured but cannot be obtained, so the request fails rather than going out without
 * them. It never resolves undefined. Tokens are never logged.
 */
export interface UpstreamCredentials {
  headersFor(request: CredentialsRequest): Promise<HeaderList>;
}
