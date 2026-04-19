# Sample Vault

A tiny Obsidian-style markdown vault included in the repo so you can run Cipher immediately without needing your own notes. ~15 files covering every folder role the app recognises.

## Use it

```bash
# from the repo root
VAULT_PATH=$(pwd)/public/sample-vault npm run dev
```

Open `http://localhost:3000` and every surface will light up: Today has tasks, System has checks + broken links, Timeline shows a week of activity, Graph renders a small cluster, Entity and Topic pages resolve.

## What's inside

```
sample-vault/
  dashboard.md           # hub file
  entities/              # people + companies + tools
    acme.md
    alice.md
    cipher.md
  journal/               # per-day notes
    2026-04-14.md
    2026-04-15.md
  projects/              # project pages
    ai-dashboard.md
    quarterly-plan.md
  research/llm-agents/   # research project structure
    executive-summary.md
    deep-dive.md
    open-questions.md
  work/                  # tasks + logs + weekly summaries
    open.md
    waiting-for.md
    log/2026/april.md
    weeks/2026/W16.md
  system/                # system status + open loops
    status.md
    open-loops.md
```

Feel free to edit these — they demonstrate the common patterns but nothing is load-bearing.
