# Contributing

Thanks for considering a contribution.

## Run it locally

```bash
git clone https://github.com/stijnhanegraaf/brain-frontend
cd brain-frontend
npm install
cp .env.example .env.local    # then set VAULT_PATH
npm run dev
# open http://localhost:3000
```

## Code style

- **TypeScript strict.** `npx tsc --noEmit` must be clean.
- **4px grid.** Every `padding`, `margin`, `gap`, `height`, `width` is a multiple of 4 (2 allowed as a half-step). The existing design tokens in `src/app/globals.css` (`--space-*`, `--row-h-*`, `--radius-*`, `--motion-*`) cover almost every case — reach for them first.
- **Token-driven colours.** No raw hex or rgba outside `src/app/globals.css`. Use `var(--bg-*)` / `var(--text-*)` / `var(--border-*)` / `var(--accent-*)` / `var(--status-*)`. Use `color-mix(in srgb, var(--x) N%, transparent)` for tinted fills.
- **`.app-row` on every list row.** Consistent hover rail + focus ring across the app.
- **`.focus-ring` on every interactive element.** Buttons, links, `role="button"` divs, list rows, chips.
- **Vault-agnostic.** Never hardcode a path like `wiki/...`. Use `getVaultLayout()` from `src/lib/vault-reader.ts`.

## PR checklist

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` green
- [ ] Every new interactive element carries `.focus-ring`
- [ ] Every new list row uses `.app-row`
- [ ] No raw hex / no off-grid spacing
- [ ] Screenshot attached for any UI change

## Asking questions

Open an issue — we respond quickly.

## License

By contributing you agree your code is released under the MIT license in `LICENSE`.
