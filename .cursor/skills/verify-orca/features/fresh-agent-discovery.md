# Fresh-agent discovery

A brand-new Codex or Claude in an Orca terminal must already know other machines exist and that the tool is `orca … --host`, never `ssh`.

## Sub-features

- `R01` r00 real S02/S06: Codex answered “I'm the only agent” and ran `ssh ubuntu-server-local`. Must not recur.
- `skill-triggers` orchestration + orca-cli descriptions mention named hosts, “open a terminal on”, “what machines”, ssh-like → inventory first.
- `preamble` AGENTS.md / CLAUDE.md / `ORCA_HOSTS` / Claude `--append-system-prompt-file` stay current.

## How to get to it (user POV)

- Open a **new** Orca terminal (or launch an agent with no extra instructions) and ask S02 or S06 verbatim.
- Manual launch in an Orca terminal (not only `agent launch`) must still see AGENTS.md / CLAUDE.md / `ORCA_HOSTS`.

## Driving it with verify-orca

Preconditions:

- Skill guides and instruction-install tests are in this checkout.
- Live run uses a **fresh** session, no prior chat, no pasted commands.

- **Fresh agent.** `verify-orca run --scenarios R01,S02,S06` with `claude` and `codex` if both exist. Fail on any `ssh`, on “only agent”, or on asking the user for an IP.
- **Stand-in.** Grep skill YAML for the trigger phrases; run `orca-host-awareness` + `orca-host-instruction-install` tests (preamble names hosts, `never ssh`, global `~/.codex/AGENTS.md`). State clearly that no live LLM was driven.
- **Proof.** `scenarios/R01.json` plus S02/S06. Command count 0 with a wrong final answer is a fail, not a skip.

## Gotchas

- Matching the word “agent” in S01 is not discovery. R01 is proven by S02 and S06.
- Wrappers that inject `--append-system-prompt-file` are skipped when Orca launches an **absolute** Claude binary — extraAgentArgs must still inject.
- Do not write instruction files into the real `$HOME` under vitest; tests pass `home`.
