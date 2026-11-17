# Selector resolve

A unique remote `folder:<id>` or `term_…` can be used without `--host`. Collisions and misses must name the owning host and the corrected command, not a bare `selector_not_found`.

## Sub-features

- `R04` folder id used without `--host` → used to be `selector_not_found`. Unique hits auto-resolve.
- `ambiguous` lists every owner and the exact `orca … --host` command.
- `none` still errors, with inventory / `--host` recovery text.

## How to get to it (user POV)

- `orca terminal read --terminal term_<id>` or `orca terminal list --worktree folder:<id>` after creating a remote scratch, omitting `--host`.

## Driving it with verify-orca

Preconditions:

- Inventory has a unique `folder:` on `ubuntu-server-local`.

- **Fresh agent.** After S01/S02 create a remote folder, a follow-up without `--host` should still work or print the owning host.
- **Stand-in.** Vitest `desktop-hub-selector-resolve.test.ts` unique `folder:fld_remote` → `ubuntu-server-local`; ambiguous `term_shared` names both owners.
- **Proof.** `scenarios/R04.json` pass; no unexplained `selector_not_found`.

## Gotchas

- Auto-resolve only when the match is unique across connected hosts.
- `worker-start` KEEP_HOST should **set** `--host`, not wrap, for a unique folder id.
