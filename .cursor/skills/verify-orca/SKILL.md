---
name: verify-orca
description: Drive Orca cross-host orchestration the way a user does — two-host desktop hub, orca CLI, Cook S01–S08 plus permanent regressions. Use when proving a build, running verify-orca, checking S01–S08, or attaching orca-deploy/verify evidence.
---

# Verify Orca cross-host orchestration

You are reading this cold. Drive the **real Orca CLI and desktop hub**, not internal setters. Cook brief: any Orca agent on any connected host, given **only** a plain-English request (no command hints), starts/messages/reads/stops agents and terminals on another connected host through `orca` only. Never SSH between hosts. Never answer trust/hooks by keystroke.

Source material: `harness/BRIEF.md`, `harness/GAPS-r01.md`, `scripts/scenarios.json`.

## Interview (this repo)

- **Surface:** `orca` CLI + desktop Orca window (visible tabs). Primary proof is CLI transcripts plus hub inventory; desktop layout is the visible-tab check.
- **Run:** in-process two-runtime desktop-hub e2e (namespaced `dockhand` + `ubuntu-server-local`, no SSH) or, if present, the Cook box rig. Do not start the user's live Orca session.
- **Drive:** existing harness first — `run-desktop-hub-e2e.ts`, mapped vitest files, Cook `harness/run_scenario.py` when a live `orca` + `claude`/`codex` exist. Otherwise the documented **scripted stand-in** in this skill.
- **Observe:** SHA, template version, per-scenario pass/fail, orca command counts, transcripts, typecheck log.
- **Isolate:** e2e uses `mkdtemp` userData dirs and tears them down. Never attach to a desktop you did not start.

## Launch

From the Orca checkout:

```bash
./.cursor/skills/verify-orca/scripts/verify-orca launch
```

Ready means `doctor` reports `ready: true`: process-host dist exists, `tsx` can load `run-desktop-hub-e2e.ts`, and the two-host catalog names `dockhand` and `ubuntu-server-local`. There is no long-lived server for the in-process rig — each drive starts its own pair of runtime servers. Teardown is `verify-orca cleanup`.

Optional live desktop (only if `ORCA_VERIFY_LIVE=1` and `orca host inventory --json` works): Cook `harness/run_scenario.py` launches a **fresh** agent with the scenario text as the sole prompt.

## Doctor

```bash
./.cursor/skills/verify-orca/scripts/verify-orca doctor
```

Read-only. Fail the instance if: wrong SHA when `ORCA_VERIFY_SHA` is set, typecheck runner missing, e2e entry missing, or a leftover process from a previous verify run owns the recorded PIDs. Writes `doctor.json` into the evidence dir.

## Drive

```bash
./.cursor/skills/verify-orca/scripts/verify-orca run
# or one feature:
./.cursor/skills/verify-orca/scripts/verify-orca run --scenarios S06
```

Read `features/README.md`, then the feature file. Fresh agent, **no hints**:

1. If `claude` or `codex` is on `PATH` **and** `orca host inventory --json` lists connected hosts, launch a new agent with **only** `scenarios.json` `text`. Record `agent=claude|codex`.
2. Otherwise use the **scripted stand-in** (`agent=scripted-stand-in`) and say so in `summary.md`. The stand-in is product-feasibility (CLI/hub/unit/e2e), not “did a fresh LLM just know”.

Bar (every NL scenario): correct result, ≤6 orca commands, 0 ssh, 0 wrong-host / `selector_not_found`, no hang >60s, no secrets in prompts, no dialog keystrokes. S04 = escalate, never auto-answer. S08 = refuse, never run locally.

**Permanent regressions** (`R01`…) never drop. Every future failure becomes a new `Rxx` in `scripts/scenarios.json` plus a feature file (or a sub-feature on an existing one).

## Evidence

Proof artifacts survive cleanup. Default location:

- `$ORCA_VERIFY_EVIDENCE_DIR` if set
- else `/cursor/stores/self/orca-deploy/verify/<sha>/` when that store exists
- else `.cursor/skills/verify-orca/evidence/<sha>/` (gitignored)

Layout:

```
summary.md          # SHA, template version, agent mode, per-scenario table
doctor.json
typecheck.log
vitest.log
e2e.log
scenarios/<ID>.json
scenarios/<ID>.md
transcripts/desktop-hub-e2e.log
```

`summary.md` must name **which** agent ran (real `claude`/`codex` vs `scripted-stand-in`) and list every stand-in step the real target will not have (no live desktop, no Codex hooks dialog, host names from the e2e catalog).

Proof standards: real user path (plain request or the exact CLI a competent agent would run after inventory); capture action **and** resulting state; side effects (unknown host did not spawn a local tab; blocked launch `outcome=agent_blocked_on_prompt`). Do not treat a unit-test mock as a visible desktop tab.

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

## Maintenance

When a verify run fails, fix product code, add a new permanent scenario (`R07`…), and re-run `verify-orca all`. Keep `features/` honest as commands and host names change.
