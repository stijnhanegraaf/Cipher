---
title: LLM Agents — deep dive
---

# LLM Agents — deep dive

## Benchmarks

| Benchmark | Open-weight 2026-Q1 | Closed 2026-Q1 |
|---|---|---|
| AgentBench | 68 | 81 |
| τ-bench   | 54 | 72 |
| SWE-bench | 43 | 57 |

## Tool latency

Per-call tool latency is the ceiling on throughput. A 200ms tool with a loop of 8 steps is 1.6s before any reasoning cost. Cache aggressively.

## Retrieval

Hybrid dense + keyword with a cross-encoder reranker landed +18% NDCG vs dense-only in our eval set. Worth the extra hop.
