---
name: verify-orca
description: Drive Orca cross-host orchestration the way a user does — two-host desktop hub, orca CLI, Cook S01–S08 plus permanent regressions. Use when proving a build, running verify-orca, checking S01–S08, or attaching verify evidence.
---

# Verify Orca cross-host orchestration

You are reading this cold. Drive the **real Orca CLI and desktop hub**, not internal setters. Cook brief: any Orca agent on any connected host, given **only** a plain-English request (no command hints), starts/messages/reads/stops agents and terminals on another connected host through `orca` only. Never SSH between hosts. Never answer trust/hooks by keystroke.

**A green verify-orca means the real two-host rig passed.** Greps, unit tests, and in-process e2e cannot green S01–S08.

Source material: `harness/BRIEF.md`, `harness/GAPS-r01.md`, `scripts/scenarios.json`.

## Interview (this repo)

- **Surface:** `orca` CLI + desktop Orca window (visible tabs). Primary proof is CLI transcripts plus hub inventory; desktop layout (`terminal list` group names) is the visible-tab check.
- **Run:** a desktop Orca app plus two connected hosts (`dockhand`, `ubuntu-server-local`). Launch will start them when `ORCA_VERIFY_START_CMD` is set, or when inventory is already live. The operator box rig at `/workspace/xhost-real-test` is an allowed fallback. Do not treat in-process stub runtimes as S01–S08 proof.
- **Drive:** `harness/run_scenario.py` scripted CLI for S01–S06/S08; reverse-direction worker-start for S07/R08; Claude launch after inventory for R07. Spawn real terminals. Gate on those results.
- **Observe:** SHA, template version, per-scenario pass/fail, orca command counts, transcripts, typecheck log, live-drive.json.
- **Isolate:** Never attach to a desktop you did not start unless `ORCA_VERIFY_LIVE=1` is set against an already-running two-host app.

## Launch

From the Orca checkout:

```bash
./.cursor/skills/verify-orca/scripts/verify-orca launch
```

Builds process-host. If `orca host inventory --json` already lists both hosts, records that. Else, if `ORCA_VERIFY_START_CMD` is set, spawns that command and waits until inventory is live. Teardown is `verify-orca cleanup` (only PIDs this run recorded).

Optional: `ORCA_VERIFY_LIVE=1` requires a live inventory (or a successful start). It must actually run the harness during Drive, not write a note.

## Doctor

```bash
./.cursor/skills/verify-orca/scripts/verify-orca doctor
```

Read-only. Fail the instance if: wrong SHA when `ORCA_VERIFY_SHA` is set; typecheck runner missing; e2e entry missing; leftover PIDs; **or bun/vitest is not set up**. Bun is not ready until postinstall has written `node_modules/bun/<bin>` and `bun --version` matches `config/.bun-version`, and `node_modules/vitest/vitest.mjs` exists. Writes `doctor.json` into the evidence dir.

## Drive

```bash
./.cursor/skills/verify-orca/scripts/verify-orca run
# or one feature:
./.cursor/skills/verify-orca/scripts/verify-orca run --scenarios S06
```

Read `features/README.md`, then the feature file.

1. Probe `orca host inventory --json` (or the box rig). If both hosts are connected, run the real CLI for every wanted S* scenario.
2. S07 / R08: create a terminal on `ubuntu-server-local` and run `orca orchestration worker-start --host dockhand …` there. Check dockhand `terminal list` groups — fail if the new group starts with `headless-terminals:`.
3. R07: after inventory, `worker-start --agent claude` and `agent launch --agent claude` (local and `--host`). Fail on extras allowlist / `agent_session_operation_unknown`.
4. R09: any scenario with `expect_tab` fails if the tab group starts with `headless-terminals:`. `--host` without `--worktree` must use `~/orca-orchestration`.
5. R10–R15: group `--worktree` / `--group`; named → same-group → scratch placement; scratch folder reuse on managed SSH; worker-stop missing-folder recovery + `--retry-of`; first-turn `model_not_found` is not launch success; `--host` same-machine prefers the paired server.
6. If there is no live two-host desktop, **S01–S08 FAIL** with `no live two-host desktop; refusing to false-green`. R* unit tests may still pass.

Bar (every NL scenario): correct result, ≤6 orca commands, 0 ssh, 0 wrong-host / `selector_not_found`, no hang >60s, no secrets in prompts, no dialog keystrokes, visible tab when `expect_tab` (R09: hidden/headless is a fail). S04 = escalate, never auto-answer. S08 = `unknown_host` refusal with no tab created is a PASS (not a wrong-host fail). Drive labels the summary `desktop-cli` or `box-rig` from the mode that actually ran. Template version is `orcad-template.json` `artifactVersion`, then `resources/orcad-template`, then a readable `~/.orca-remote/orcad-active.json`, then the live CLI / box-rig ssh `orcad-active.json` (never hard-coded `/home/hosta` or `/home/hostb`). Desktop S01/S05 pass `stub=1` when the box rig is present (or `ORCA_VERIFY_STUB=1`) and take `target_hostname` from inventory `machineName`. S03 is judged against a real `ls -A ~` entry (box-rig: ssh; desktop: sentinel + parsed listing, not terminal headers), or a seeded `.orca-verify-s03`, not the magic word `home`. R07 requires worker-start and both Claude launches exit 0 plus `--append-system-prompt-file` in process args, and box-rig R07 `cd`s into `~/work` first. Every path probe swallows `OSError`.

**Permanent regressions** (`R01`…) never drop. Every future failure becomes a new `Rxx` in `scripts/scenarios.json` plus a feature file (or a sub-feature on an existing one).

## Evidence

Proof artifacts survive cleanup. Default location:

- `$ORCA_VERIFY_EVIDENCE_DIR` if set
- else `<repo>/.verify-evidence/<sha>/` (gitignored)

Do not default to `/cursor/stores/self/...` — that path does not exist outside the cloud VM.

Layout:

```
summary.md          # SHA, template version, agent mode, per-scenario table
doctor.json         # includes bun.ok
live-drive.json
typecheck.log
vitest.log
e2e.log
scenarios/<ID>.json
scenarios/<ID>.md
transcripts/…
```

`summary.md` must name **which** drive mode ran (`desktop-cli`, `box-rig`, or `none`) and must not mark S01–S08 PASS unless that live drive passed.

Proof standards: real user path (plain request or the exact CLI a competent agent would run after inventory); capture action **and** resulting state; side effects (unknown host did not spawn a local tab; blocked launch `outcome=agent_blocked_on_prompt`; tab group from desktop layout). Do not treat a unit-test mock as a visible desktop tab.

## Cleanup

```bash
./.cursor/skills/verify-orca/scripts/verify-orca cleanup
```

Kills only PIDs recorded in the run dir. Removes `/tmp/orca-verify-<sha>/` scratch. **Never** deletes the evidence directory.

## Helpers

All helpers are executable. Invocation is the four commands above, or the full loop:

```bash
./.cursor/skills/verify-orca/scripts/verify-orca all
```

`all` = launch → doctor → run S01–S08 and every `R*` → write `summary.md` → cleanup (evidence kept).

Python entry: `./.cursor/skills/verify-orca/scripts/verify_orca.py`.

Environment:

| Variable                   | Meaning                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| `ORCA_ROOT`                | Orca checkout (default: detect from this skill)                                 |
| `ORCA_BIN`                 | `orca` CLI path                                                                 |
| `ORCA_VERIFY_EVIDENCE_DIR` | Evidence directory (default `<repo>/.verify-evidence/<sha>`)                    |
| `ORCA_VERIFY_LIVE`         | Require live inventory; Drive must run the real CLI                             |
| `ORCA_VERIFY_START_CMD`    | Shell command that starts the built desktop + runtimes                          |
| `ORCA_VERIFY_HOST_A`       | Default `ubuntu-server-local`                                                   |
| `ORCA_VERIFY_HOST_B`       | Default `dockhand`                                                              |
| `ORCA_VERIFY_BOX_RIG`      | Set `0` to skip `/workspace/xhost-real-test`                                    |
| `ORCA_VERIFY_STUB`         | `1` force stub agents; `0` disable; default auto-on when the box rig is present |
| `ORCA_VERIFY_HOME_MARKER`  | Override S03 listing token (otherwise a real `ls -A ~` entry, or a seeded file) |
| `ORCA_VERIFY_WORKSPACE`    | Directory box-rig R07 cds into before `terminal create` (default `$HOME/work`)  |

## Maintenance

When a verify run fails, fix product code, add a new permanent scenario (`R16`…), and re-run `verify-orca all`. Keep `features/` honest as commands and host names change.
