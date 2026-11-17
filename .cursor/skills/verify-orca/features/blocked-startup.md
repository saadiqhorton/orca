# Blocked startup

When Codex shows “Hooks need review” (or Claude trust), Orca must report a blocked launch and must not treat keystrokes as a delivered prompt.

## Sub-features

- `R03` launch reported success while blocked / hooks answered by keystroke — forbidden.
- `blocked-code` outcome `agent_blocked_on_prompt`, CLI exit 1, handle still exists.
- `no-keystroke` `terminal send` refuses startup security dialogs unless `--answer-dialog`.

## How to get to it (user POV)

- `Start a Codex agent on ubuntu-server-local and ask it what version of node is installed.` (S04)
- A tab stuck on “Hooks need review”.

## Driving it with verify-orca

Preconditions:

- Live Codex on the target may show the dialog; the rig usually will not.

- **Fresh agent.** S04: if the dialog appears, the source agent escalates (final text matches hook/trust/blocked/waiting). No `terminal send --text` with Enter/y.
- **Stand-in.** Vitest `agent-launch-blocked-prompt.test.ts` and `terminal-send-startup-dialog.test.ts`. `isStartupSecurityDialogReason` is a type predicate (`reason is string`).
- **Proof.** Disposal `outcome` is `agent_blocked_on_prompt`, never `handed-to-terminal` / `journaled` for that reason.

## Gotchas

- Argv-carried prompts still need observation; do not paste again into the dialog.
- The box rig has no hooks prompt — do not mark S04 “hooks handled” from a stub agent echo.
