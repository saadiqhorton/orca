# Inventory

A user (or a fresh agent) can ask what machines and agents are reachable right now and get connected host names plus agent CLIs, using Orca, not SSH.

## Sub-features

- `S06` answers “What machines and agents can you use right now?” with `ubuntu-server-local` (and the other connected names) and at least one of `claude` / `codex`.
- `inventory-first` starts with `orca host inventory --json` (≤6 orca commands, usually 1).

## How to get to it (user POV)

- Ask, with no hints: `What machines and agents can you use right now?`
- Run `orca host inventory --json` in an Orca terminal.

## Driving it with verify-orca

Preconditions:

- Doctor reports two connected hosts including `ubuntu-server-local`.
- Scenario text is exactly `scripts/scenarios.json` `S06.text`.

- **Fresh agent.** Launch with only that text. Run `./.cursor/skills/verify-orca/scripts/verify-orca run --scenarios S06`. Final answer contains `ubuntu-server-local` and `claude` or `codex`. Zero `ssh`. ≤3 orca commands.
- **Stand-in.** Same helper. Expect e2e inventory lines `ubuntu-server-local (dezignerdrugz00)  connected` and `host B agents: claude, codex`, plus skill descriptions that trigger on “what machines”.
- **Proof.** `scenarios/S06.json` `bar.no_ssh`, `metrics.orca_invocations` ≤ 6, `pass: true`.

## Gotchas

- A successful local `hostname` is not inventory. The answer must name **other** connected machines.
- r00 real Codex said it was the only agent (0 orca commands). That is R01 as well as S06.
- Do not pass S06 on skill-text grep alone when a live agent ran and still omitted host names.
