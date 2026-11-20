import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli-argument-boundary'

export const AGENT_LAUNCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'launch'],
    summary: 'Start an agent in an existing workspace, as a chat or a terminal',
    usage:
      'orca agent launch --agent <id> [--host <desktop-connected-host>] [--worktree <selector>] [--group "<name>"] [--prompt <text>] [--model <id>] [--effort <level>] [--surface chat|terminal] [--focus] [--retry-launch <operationId>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'agent',
      'worktree',
      'group',
      'prompt',
      'model',
      'effort',
      'surface',
      'focus',
      'retry-launch'
    ],
    notes: [
      'Starts the agent the way a new agent tab does: as a chat when your Chat | CLI choice for the agent is Chat and the agent and host support it, otherwise as a terminal. The result says which (`outcome.kind`) and why (`receipt.detail`).',
      '--surface chat|terminal picks for this launch instead of your setting. --surface terminal always runs the agent CLI; --surface chat is refused when Orca can establish before starting anything that this agent cannot open as a chat there. If support cannot be checked, the launch can fall back to a terminal. If chat becomes unavailable after creating a workspace, Orca keeps the workspace, setup and default tabs, then opens a terminal; the receipt explains the fallback.',
      '--worktree defaults to the native folder workspace or worktree containing the current directory. For a new checkout with its agent, use `orca worktree create --agent`.',
      '--host <name> opens the tab on a machine the desktop app is connected to (`orca host list` / `orca host inventory`). The tab appears in the desktop Orca window under that host\'s project. Without --worktree, Orca uses a workspace in the same-named project group when the caller is in one, otherwise ~/orca-orchestration on that host — never the most recently used real checkout. `--group "<name>"` (or `--worktree group:"<name>"`) targets that group\'s single workspace. Name --worktree only when the task should run in that repo. Do not use SSH. A Codex hooks or Claude trust dialog is `agent_blocked_on_prompt` (exit 5) — never treat the prompt as delivered; ask the user to answer it in the desktop window. A hub wait that expires is `desktop_hub_call_timeout` or `timed_out`. Orchestration, terminal, agent, and host commands use exit 2 host_mismatch, 3 unknown_host or session_not_found, 4 host_unreachable / host_offline / needs_sign_in, 5 agent_blocked_on_prompt, 6 incompatible_runtime.',
      '--model takes a provider model id (OMP also takes its model roles and selectors) and --effort a reasoning effort for that model; --effort requires --model. They apply to either surface.',
      'The tab opens without switching focus; pass --focus to switch to it.',
      'If the launch reply is lost, re-issue the same command from the same directory on the same host with --retry-launch <operationId> from the error. Never retry as a fresh launch; older hosts require inspecting the workspace first.'
    ],
    examples: [
      'orca agent launch --agent codex --json',
      'orca agent launch --agent codex --model gpt-6-astra --effort high --prompt "Write the design doc" --json',
      'orca agent launch --agent claude --worktree path:/projects/myapp --focus',
      'orca agent launch --host ubuntu-server-local --agent claude --prompt "Review the deploy" --json'
    ]
  }
]
