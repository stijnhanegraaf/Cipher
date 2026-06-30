import "server-only";
import { invalidateGraphCache } from "@/lib/vault-graph";
import { invalidateHealthCache } from "@/lib/vault-health";
import { invalidateTagCache } from "@/lib/vault-tags";
import { invalidateVaultTreeCache } from "@/app/api/vault/tree/route";

/**
 * Clear all derived caches that go stale after a vault file write.
 * vault-reader's own file cache is mtime-keyed and self-heals; the graph,
 * health and tree caches are not, so they must be cleared explicitly.
 */
export function invalidateAfterWrite(): void {
  invalidateVaultTreeCache();
  invalidateGraphCache();
  invalidateHealthCache();
  invalidateTagCache();
}
