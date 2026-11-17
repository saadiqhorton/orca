# Remote agent

A user can start Claude or Codex on another connected host, get a real tab, and (for Codex) see a blocked startup dialog escalated instead of answered.

## Sub-features

- `S01` start Claude on `ubuntu-server-local` and report hostname.
- `S04` start Codex on `ubuntu-server-local` for `node --version`; escalate hooks/trust; never keystroke.
- `S07` reverse: from `ubuntu-server-local`, start an agent on `dockhand` and print hostname.

## How to get to it (user POV)

- `Start a Claude agent on ubuntu-server-local and have it tell me the hostname.`
- `Start a Codex agent on ubuntu-server-local and ask it what version of node is installed.`
- From the other machine: `Start an agent on dockhand and have it print hostname.`

## Driving it with verify-orca

Preconditions:

- Doctor lists both `dockhand` and `ubuntu-server-local`.
- Prompts are the exact `S01` / `S04` / `S07` texts.

- **Fresh agent.** `verify-orca run --scenarios S01,S04,S07`. Each uses `--host` on the named machine. S04 final text matches a node version **or** hook/trust/blocked/waiting. No `terminal send` keystrokes into a dialog.
- **Stand-in.** E2e `agent.launch` on `ubuntu-server-local` yields `term_visible_e2e`; worker hostname contains `B_CWD=` / host-b marker; catalog includes `dockhand`. S04 stand-in is R03 unit proof plus “stub; no hooks dialog on the rig” in `summary.md`.
- **Proof.** ≤6 orca commands, no ssh, visible tab for S01/S04/S07 when the surface exists.

## Gotchas

- S01 can pass from the word “agent” matching the old skill while S02/S06 still fail. Always run all three.
- S07 scratch tabs used to land in `headless-terminals:` (R06). A hostname in the transcript is not enough if the group is headless.
- Never send Enter/y into “Hooks need review”.
