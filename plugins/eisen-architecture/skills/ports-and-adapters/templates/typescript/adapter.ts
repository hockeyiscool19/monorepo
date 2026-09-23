/**
 * HttpRegistrySource — the RegistrySource adapter for an HTTP endpoint.
 * Lives in adapters/outbound/http-registry-source.ts. Named by technology (Http*), not by role
 * (*Impl, *Client). Its whole job: call the technology, validate the payload into the contract,
 * translate technology failures into the domain error hierarchy. No business rules here.
 * `fetchImpl` is injectable so a contract test can hand it a canned Response.
 */
import type { RegistrySource } from '../../application/ports/registry-source';
import { parseLoadRegistryResult, type LoadRegistryRequest, type LoadRegistryResult } from '../../domain/contract';
import { ContractError, UpstreamError } from '../../domain/errors';

export type HttpRegistrySourceOptions = { readonly baseUrl: string; readonly timeoutMs?: number };

export class HttpRegistrySource implements RegistrySource {
  constructor(
    private readonly options: HttpRegistrySourceOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Fetch and validate; rejects with UpstreamError or ContractError, never a fetch error. */
  async load(request: LoadRegistryRequest): Promise<LoadRegistryResult> {
    const url = new URL('/registry.json', this.options.baseUrl);
    url.searchParams.set('include_hidden', String(request.includeHidden));
    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000) });
    } catch (cause) {
      throw new UpstreamError(`registry fetch failed: ${String(cause)}`, { cause });
    }
    if (!response.ok) throw new UpstreamError(`registry answered ${response.status}`, { detail: url.href });
    const payload: unknown = await response.json().catch(() => null);
    const result = parseLoadRegistryResult(payload);
    if (result === null) throw new ContractError('registry payload does not match the contract', { detail: url.href });
    return result;
  }
}
