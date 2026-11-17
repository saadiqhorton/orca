# Visible tabs

`--host` agent terminals, workers, and scratch shells must show as normal desktop tabs, not `headless-terminals:folder:…` only.

## Sub-features

- `R06` remote tabs landing in the headless group (real S01, rig S07).
- `omit-background` CLI omits `presentation: 'background'` when `client.isRemote`.
- `published-visible` a published PTY session counts as `surface: 'visible'` (no “could not make it discoverable”).

## How to get to it (user POV)

- `orca agent launch --host ubuntu-server-local --agent claude --prompt …`
- `orca terminal create --host ubuntu-server-local`
- Worker-start `--host` (S01/S07). Look at the desktop tab strip / `terminal list --host` group names.

## Driving it with verify-orca

Preconditions:

- Doctor ready. S01/S07/S02 create surfaces on the target.

- **Fresh agent.** After S01/S02/S07, every new target handle has `tabId` and `group` that does not start with `headless-terminals:`.
- **Stand-in.** `cli-launch-presentation` remote → `undefined` (not `background`); e2e launched tab `term_visible_e2e`; `ensure-orchestration-scratch` `skipPrimaryTerminal: true` (no extra shell).
- **Proof.** `scenarios/R06.json`. Saadiq seeing four tabs on an older demo does not waive worker-start / S07.

## Gotchas

- The synthetic group id `headless-terminals:${worktreeId}` still exists in orcad layout projection. Visibility is `presentation` / `surface: 'visible'` / desktop reveal, not renaming that id.
- Worker-start and reverse S07 were the headless paths; agent-launch `--focus` is not the default `--host` path.
