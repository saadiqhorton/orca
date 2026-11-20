# Orca cross-host verification map

This directory is the maintained source for verifying user-facing cross-host orchestration. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Run from the Orca git checkout. Record `git rev-parse HEAD` as the build SHA.
- Launch via `./.cursor/skills/verify-orca/scripts/verify-orca launch` (builds process-host; starts the desktop if `ORCA_VERIFY_START_CMD` is set or inventory is already live).
- Run `./.cursor/skills/verify-orca/scripts/verify-orca doctor` and require `ready: true` **including bun/vitest** (pinned bun binary from postinstall, `vitest.mjs`).
- Put the skill `scripts/` on your mental PATH; invoke helpers exactly as written.
- Never drive a desktop Orca instance this run did not start, unless `ORCA_VERIFY_LIVE=1` against an already-running two-host desktop.
- Fresh-agent drives use the scenario `text` as the **only** prompt. No command hints. S01–S08 are real CLI only.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Prefer `orca host inventory --json` then `orca … --host <name>`. Never `ssh`.
- Live drive: Cook `harness/run_scenario.py --agent scripted` plus reverse worker-start and Claude-after-inventory. Gate S01–S08 on those results.
- No live two-host desktop: S01–S08 **FAIL** (no grep / in-process e2e false-green).
- Restore/close tabs this run created. Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the last log line.
- CLI proof includes the command, stdout, stderr, and exit code.
- Hub proof includes host names, `unknown_host` / `desktop_hub_unavailable` codes, and that no local tab was created for a refused host.
- Visible-tab proof is a handle whose group does **not** start with `headless-terminals:`, read from `terminal list` layout on the target host.
- Record the feature ID and entry point with every artifact.
- An unreachable live two-host path is a **FAIL** for S01–S08, not a skip and not a grep pass.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-orca`, `Gotchas`.

## Features

- [Inventory](./inventory.md) — S06 machines and agents.
- [Remote terminal](./remote-terminal.md) — S02 open a terminal on a named host.
- [Remote agent](./remote-agent.md) — S01, S04, S07 launch/escalate on another host.
- [Worker](./worker.md) — S03, S05 start, message, read, stop.
- [Unknown host](./unknown-host.md) — S08, R02 refuse, never local.
- [Fresh-agent discovery](./fresh-agent-discovery.md) — R01 no ssh, not “only agent”.
- [Blocked startup](./blocked-startup.md) — R03 Hooks need review.
- [Selector resolve](./selector-resolve.md) — R04 folder:/term_ without `--host`.
- [Typecheck gate](./typecheck-gate.md) — R05 compile before push.
- [Visible tabs](./visible-tabs.md) — R06 `--host` surfaces not headless; R08 reverse worker-start; R09 expected tabs must not be headless.
- [Claude launch after inventory](./claude-launch-after-inventory.md) — R07 Orca-owned Claude argv.
- [Group target](./group-target.md) — R10 `--group` / `group:` selector.
- [Placement order](./placement-order.md) — R11 named → same-group → scratch.
- [Scratch persist](./scratch-persist.md) — R12 reuse `~/orca-orchestration` on managed SSH.
- [Stop recovery](./stop-recovery.md) — R13 missing-folder stop and `--retry-of`.
- [First-turn status](./first-turn-status.md) — R14 fatal first turn is not launch success.
- [Host same machine](./host-same-machine.md) — R15 `--host` prefers the paired server.

## Permanent scenario rule

`scripts/scenarios.json` is the suite. S01–S08 stay forever. Every measured failure becomes a new `Rxx` that stays forever. Do not delete or weaken a scenario to make a run pass.
