/**
 * FakeRegistrySource — an in-memory RegistrySource that ships with the package.
 * Lives in adapters/outbound/fakes/registry-source.ts, next to the real adapters, so the
 * composition root, a `--registry fake` CLI flag and every test can use it. It is
 * deterministic, records each call, and can be told to fail with a domain error — which is
 * how tests exercise the port's documented failure behaviour without a network.
 */
import type { RegistrySource } from '../../../application/ports/registry-source';
import { CONTRACT_VERSION, type LoadRegistryRequest, type LoadRegistryResult } from '../../../domain/contract';
import type { AppError } from '../../../domain/errors';

export class FakeRegistrySource implements RegistrySource {
  readonly calls: LoadRegistryRequest[] = [];

  constructor(
    private readonly result: LoadRegistryResult = { contractVersion: CONTRACT_VERSION, apps: [] },
    private readonly failure: AppError | null = null,
  ) {}

  /** Record the request, then resolve the canned result or reject with the canned failure. */
  async load(request: LoadRegistryRequest): Promise<LoadRegistryResult> {
    this.calls.push(request);
    if (this.failure !== null) throw this.failure;
    return this.result;
  }
}
