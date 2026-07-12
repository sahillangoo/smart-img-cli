# Project Rules

- **Runtime & Package Manager:** Use `bun` EXCLUSIVELY. Do not use Node.js, `npm`, or `pnpm` (Overrides global rule to use `pnpm`).
- **Formatting & Linting:** Use `Biome`. Do not use ESLint or Prettier. Use `bun run check` to validate code.
- **Ponytail Philosophy (Ultra-Lean):** Keep dependencies to an absolute minimum. Favor native features (e.g. Bun native capabilities). Avoid over-engineering, abstractions, or boilerplate. If it can be a one-liner, it should be.
