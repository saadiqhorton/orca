# Placement order

When `--worktree` is omitted, Orca picks (a) a named group/workspace, (b) a workspace in a same-named visible group as the caller, else (c) the visible `~/orca-orchestration` scratch. The receipt includes `placement.source` (`named` | `same-group` | `scratch`) and the group. Tabs stay desktop-visible (R09).

## Sub-features

- `R11` Hawser-on-clawd: caller in `dockhand group` on dockhand, target clawd also has `dockhand group` → use `clawd/clawd`, not a new orca-orchestration group.
- Named `--group` still wins over same-group and scratch.
- Missing same-named group falls through to scratch.

## How to get to it (user POV)

- From a workspace in `dockhand group`: `orca agent launch --host clawd --agent claude --prompt "set up Hawser"`
- Inspect the receipt `sessionPlacement.source` and `sessionPlacement.group`.

## Driving it with verify-orca

Preconditions:

- Doctor ready. Caller cwd is in a named group the target also lists.

- **Unit.** `orchestration-session-placement.test.ts` covers scratch default, named `dockhand group`, and same-named group ids `d51c5999` / `8c735346`.
- **Proof.** `scenarios/R11.json`.

## Gotchas

- Same-group matching is by name, not id.
- Scratch remains the R09 visible fallback, never the most-recent real repo.
