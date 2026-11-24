import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

export const TERMINAL_SEND_COMMAND_SPEC: CommandSpec = {
  path: ['terminal', 'send'],
  summary: 'Send input to a live terminal',
  usage:
    'orca terminal send [--host <name>] [--terminal <handle>] [--text <text>] [--enter] [--interrupt] [--wait-submit <seconds>] [--retry-request <id>] [--answer-dialog] [--json]',
  allowedFlags: [
    ...GLOBAL_FLAGS,
    'terminal',
    'text',
    'enter',
    'interrupt',
    'wait-submit',
    'retry-request',
    'answer-dialog'
  ],
  examples: [
    'orca terminal send --terminal term_123 --text "npm test" --enter --json',
    'orca terminal send --host ubuntu-server-local --terminal term_abc123 --text "hello" --enter'
  ],
  notes: [
    'For shells, dev servers, REPLs and your own pane. To message another agent, use orca orchestration send; never type into its input.',
    "Without --enter, --text is written to the PTY verbatim, so control bytes pass through (Bash/Zsh: --text $'\\x1b' for Escape, $'\\x15' for Ctrl+U).",
    'With --enter and without --interrupt, a prompt to a recognized running agent is bracketed-pasted and embedded Escape bytes are made inert.',
    'For a text-plus-Enter agent prompt, the result separates input acceptance from observed submission and turn start.',
    '--wait-submit only observes the accepted prompt for the requested duration; timeout returns the queued/input-accepted receipt and never resends.',
    'After an ambiguous transport failure, reissue the exact command with the reported --retry-request ID. The ID is bound to the prompt payload and exact terminal process incarnation.',
    'Older hosts accept the legacy raw input but report provider old-host and do not offer idempotent retry or submission observation.',
    '--host <name> is a desktop-connected machine from `orca host inventory`; optional once Orca can locate the session. The tab is the same one in the desktop Orca window.',
    'Never answer trust, hooks, or other security dialogs with keystrokes. Orca refuses send while those dialogs are on screen unless you pass --answer-dialog after the user asked you to.'
  ]
}
