// ═══════════════════════════════════════════════════════
// Runtime factory for creating provider-specific runtimes
// ═══════════════════════════════════════════════════════
import type { ChatRuntime } from './types';

export class RuntimeFactory {
  private static runtimes: Map<string, () => ChatRuntime> = new Map();

  static register(providerId: string, factory: () => ChatRuntime) {
    this.runtimes.set(providerId, factory);
  }

  static create(providerId: string): ChatRuntime {
    const factory = this.runtimes.get(providerId);
    if (!factory) {
      throw new Error(`Unknown provider: ${providerId}. Available: ${Array.from(this.runtimes.keys()).join(', ')}`);
    }
    return factory();
  }

  static hasProvider(providerId: string): boolean {
    return this.runtimes.has(providerId);
  }

  static listProviders(): string[] {
    return Array.from(this.runtimes.keys());
  }
}
