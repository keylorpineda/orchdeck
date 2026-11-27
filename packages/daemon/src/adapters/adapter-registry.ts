import {
  parseModelHandle,
  type AdapterSummary,
  type CanonicalModelHandle,
  type ProviderAdapter,
  type ProviderId,
} from '@orchdeck/shared';

export class AdapterRegistry {
  private readonly adapters = new Map<ProviderId, ProviderAdapter>();

  constructor(initialAdapters: readonly ProviderAdapter[] = []) {
    for (const adapter of initialAdapters) {
      this.register(adapter);
    }
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(provider: ProviderId): ProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No ProviderAdapter registered for provider "${provider}".`);
    }
    return adapter;
  }

  resolveModelHandle(modelHandle: string): {
    readonly parsed: CanonicalModelHandle;
    readonly adapter: ProviderAdapter;
  } {
    const parsed = parseModelHandle(modelHandle);
    const adapter = this.get(parsed.provider);
    return { parsed, adapter };
  }

  async listSummaries(): Promise<readonly AdapterSummary[]> {
    const summaries: AdapterSummary[] = [];
    for (const adapter of this.adapters.values()) {
      const [health, models] = await Promise.all([adapter.healthCheck(), adapter.listModels()]);
      summaries.push({
        id: adapter.id,
        pinnedCliVersionRange: adapter.pinnedCliVersionRange,
        health,
        models,
      });
    }
    return summaries;
  }
}
