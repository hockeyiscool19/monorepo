/**
 * The RegistrySource port. Lives in application/ports/registry-source.ts.
 * An interface with one method per capability; each method takes ONE request type and returns
 * ONE result type, both readonly (see contract.ts), so adding a field never changes a signature.
 * Outbound ports in Node return Promises because Node I/O is asynchronous; domain code stays
 * synchronous. Failure behaviour is part of the contract and is written here, once.
 */
import type { LoadRegistryRequest, LoadRegistryResult } from '../../domain/contract';

/**
 * Where the app registry comes from (HTTP, local file, fake).
 *
 * Failure contract — every adapter obeys it, and tests assert it against the fake:
 * - rejects with UpstreamError when the source cannot be reached or answers with an error;
 * - rejects with ContractError when the payload does not validate as LoadRegistryResult;
 * - never resolves undefined or a partial result; never lets a technology error
 *   (fetch TypeError, AbortError, SyntaxError from JSON) escape — the adapter maps it.
 */
export interface RegistrySource {
  load(request: LoadRegistryRequest): Promise<LoadRegistryResult>;
}
