# Typecheck gate

The commit under test must typecheck. 883313df shipped with TS2345 ×3; that is a permanent fail.

## Sub-features

- `R05` `isStartupSecurityDialogReason(reason: string | undefined): reason is string` and full project typecheck exit 0.
- `lint-changed` oxlint `--deny-warnings` on changed `src` paths.

## How to get to it (user POV)

- Push / verify a SHA. Agents must not ship a commit `tsc` rejects.

## Driving it with verify-orca

Preconditions:

- Invoke Node scripts directly (pnpm `ERR_PNPM_UNSAFE_TASK_RUN_STATE_PATH` when `node_modules` is a symlink): `node config/scripts/typecheck/project-execution/run-typecheck-projects-in-parallel.mjs`.
- Build process-host first: `./node_modules/.bin/tsx --conditions=orca-source src/packages/process-host/scripts/build-dist.mjs`.

- **Stand-in / only path.** `verify-orca run --scenarios R05` runs full typecheck. Fail the whole verify run if it fails.
- **Proof.** `typecheck.log` ends with exit 0. `scenarios/R05.json` `pass: true`.

## Gotchas

- Do not run `pnpm typecheck` in this environment. Use the `node config/scripts/...` entry.
- A passing CLI-only `tsc` is not enough; R05 is the parallel project typecheck used before every push.
