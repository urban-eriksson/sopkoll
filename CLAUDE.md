# sopkoll — notes for agents

- Read `PLAN.md` first: it records the verified SVOA endpoints, the shared-EC2 facts and every
  product decision (no login, items are independent, one global reminder rule).
- Look and feel are deliberately those of `../bike-my-day` with a brown palette. When adding
  UI, copy a component from there rather than inventing a new pattern. Design tokens live in
  `apps/web/src/index.css`; lid colours are `--bin-*` and appear nowhere but `BinIcon`.
- All copy is Swedish and lives in `apps/web/src/lib/i18n.ts`.
- Date math exists twice on purpose (`apps/web/src/lib/schedule.ts`, `server/src/sopkoll/schedule.py`)
  and both have tests with the same cases. Change them together.
- The server has no migrations: a schema change means deleting the dev DB.
- Never run `scripts/deploy-*.sh` or `cdk deploy` without being asked; they touch the shared box
  and DNS. `cdk synth` is fine.
- Checks before committing: `cd apps/web && npm run check && npm test`; `cd server && uv run pytest`.
