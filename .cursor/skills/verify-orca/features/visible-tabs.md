# Visible tabs

`--host` agent terminals, workers, and scratch shells must show as normal desktop tabs, not `headless-terminals:folder:…` only.

## Sub-features

- `R06` remote tabs landing in the headless group (real S01, rig S07).
- `R08` reverse-direction `worker-start` from `ubuntu-server-local` `--host dockhand` must not use `headless-terminals:folder:*`.
- `R09` any scenario with `expect_tab` fails if the tab is hidden/headless. `orca terminal create --host` / `orca agent launch --host` must use the visible Orca orchestration scratch unless the command names a workspace.
- `omit-background` CLI omits `presentation: 'background'` when `client.isRemote`.
- `published-visible` a published PTY session counts as `surface: 'visible'` (no “could not make it discoverable”).
- `folder-group` `getHeadlessMobileSessionGroupId('folder:…')` returns `orca-orchestration:folder:…`.

## How to get to it (user POV)

- `orca agent launch --host ubuntu-server-local --agent claude --prompt …`
- `orca terminal create --host ubuntu-server-local`
- Worker-start `--host` (S01/S07). Look at the desktop tab strip / `terminal list --host` group names.

## Driving it with verify-orca

Preconditions:

- Doctor ready. S01/S07/S02 create surfaces on the target.

- **Fresh agent.** After S01/S02/S07, every new target handle has `tabId` and `group` that does not start with `headless-terminals:`.
- **Live R08.** Drive creates a terminal on `ubuntu-server-local` and runs `orca orchestration worker-start --host dockhand` there, then reads dockhand `terminal list` group names.
- **Unit.** `getHeadlessMobileSessionGroupId('folder:fld_dockhand')` is `orca-orchestration:folder:fld_dockhand`.
- **Proof.** `scenarios/R06.json`, `scenarios/R08.json`, and `scenarios/R09.json`. Saadiq seeing four tabs on an older demo does not waive reverse worker-start / S07. A tab whose group starts with `headless-terminals:` fails R09 even if the scenario otherwise passed.

## Gotchas

- Folder scratch must not use `headless-terminals:folder:…` — that prefix is what the cook visibility bar treats as hidden. Reverse S07 creates a new `folder:` worktree, so `existingGroups[0]` cannot save it.
- Worker-start and reverse S07 were the headless paths; agent-launch `--focus` is not the default `--host` path.
