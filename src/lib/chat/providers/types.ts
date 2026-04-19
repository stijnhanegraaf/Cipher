/**
 * Provider abstraction — shared interface for Ollama / OpenAI / Anthropic.
 */

import "server-only";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class ProviderDownError extends Error {
  constructor(public providerId: string, base: string) {
    super(`${providerId} not reachable at ${base}`);
    this.name = "ProviderDownError";
  }
}

export class ProviderModelMissingError extends Error {
  constructor(public providerId: string, public model: string) {
    super(`Model "${model}" not available on ${providerId}`);
    this.name = "ProviderModelMissingError";
  }
}

export class ProviderAuthError extends Error {
  constructor(public providerId: string) {
    super(`${providerId} authentication failed — check API key`);
    this.name = "ProviderAuthError";
  }
}

export interface ProviderStatus {
  ok: boolean;
  /** Models available on this provider. May be static or discovered. */
  models: string[];
  /** Default model to select when switching to this provider. */
  defaultModel: string;
  /** Whether an API key is required but missing. */
  needsKey?: boolean;
}

export interface ChatProvider {
  id: string;
  label: string;
  /** Yields content deltas as they arrive. */
  streamChat(model: string, messages: ChatMessage[]): AsyncIterable<string>;
  /** Reachability + model list. */
  status(): Promise<ProviderStatus>;
}
