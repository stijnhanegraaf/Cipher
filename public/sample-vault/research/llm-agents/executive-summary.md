---
title: LLM Agents — executive summary
---

# LLM Agents — executive summary

## The Answer

Small, task-specific agents outperform monolithic ones for structured query workloads, given strong retrieval + tight tool interfaces.

## Key Findings

- **Tool latency dominates** everything else once context is >4k tokens.
- **Retrieval quality** compounds: a 10% recall gain ≈ 25% lower hallucination.
- **Open-weight models** now within 15% of closed models on agentic benchmarks.

## Recommendation

Build [[ai-dashboard]] on an open-weight model with a tight tool schema. Reserve closed models for open-ended NL work.

See [[deep-dive]] and [[open-questions]].
