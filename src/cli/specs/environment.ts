import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli-argument-boundary'
import { LOCAL_COMMAND_FLAGS } from '../arguments/args'

export const ENVIRONMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['host', 'name'],
    summary: 'Show or set the name this Orca runtime reports to connected clients',
    usage: 'orca host name [--name <name>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name'],
    notes: [
      'With --name, updates the answering runtime over its authenticated connection. Use an empty value to return to the detected computer name.',
      'Without --name, prints the name and platform the answering runtime reports.'
    ],
    examples: ['orca host name', 'orca host name --name build-server']
  },
  {
    path: ['host', 'list'],
    summary: 'List every machine this Orca host can target, and how to name each one',
    usage: 'orca host list [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    notes: [
      'Answers "what can I target and what do I pass" in one place: this machine, the SSH targets registered on it, the Orca servers paired with it, and every machine the desktop app is connected to.',
      "Desktop-connected rows use --host <name> and a status of connected, needs_sign_in, or unreachable. `orca host inventory` shows each host's projects, agent CLIs, and live tabs. Open a visible agent or terminal on one with `orca agent launch --host <name>` or `orca terminal create --host <name>`. Hidden workers still use `orca orchestration worker-start --host <name>`. Do not use SSH. A needs_sign_in host must be signed in or re-paired in the desktop app. An unreachable host is not connected, and Orca will not try SSH.",
      'The three kinds are reached differently. A paired Orca server is a connection, selected with --environment <name>. An SSH target is a machine the connected Orca host reaches, selected with --host ssh:<id>. Passing one where the other belongs is the most common way to get an empty or missing-host answer.',
      'Commands that take --host also accept any name this list prints, such as --host "this machine" or --host <ssh-target-name> (except `orca host rm`, which takes only the ssh:<target-id> form). A name two hosts share is refused with the exact flag for each.',
      'SSH rows include the detected remote platform after that target has connected (linux, darwin, or win32); disconnected or older targets report platform unknown.',
      'SSH rows also include whether the target is currently connected and its lifecycle status when known.',
      'Paired-server rows come from the pairing store and report platform unknown; ask one server directly with `orca host name --environment <name>`.',
      "SSH targets are read from this machine's own Orca runtime. Desktop-connected hosts come from the desktop app this machine is paired with, so a session on one execution host lists the user's other machines too.",
      '--environment and --pairing-code are rejected rather than ignored: paired servers come from this machine\u2019s pairing store, so a routed answer would describe two machines at once.'
    ],
    examples: ['orca host list', 'orca host list --json']
  },
  {
    path: ['host', 'inventory'],
    summary: 'List every connected host with its projects, agent CLIs, and live sessions',
    usage: 'orca host inventory [--json] [--group "<name>"]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'group'],
    notes: [
      'One command an agent can run to see the desktop-connected fleet: each host, whether it is connected, the Orca projects and folder workspaces on it, which agent CLIs are installed, and live terminal/agent tabs. Each repo and folder includes projectGroupId, projectGroupName, and a ready selector (`id:<repo>::<path>` or `folder:<id>`). Each project lists its members. `--group "<name>"` filters to that project group.',
      'Then act with `orca agent launch --host <name>`, `orca terminal create --host <name>`, `orca terminal list --host <name>`, `orca terminal send --host <name>`, `orca worktree create --host <name> --name <name>`, or `orca orchestration send --host <name>`. Those commands open or drive real tabs in the desktop Orca window.',
      'Do not use SSH. needs_sign_in and unreachable hosts are listed with that status and are not dialed.',
      'Host commands use exit 2 host_mismatch, 3 unknown_host or session_not_found, 4 host_unreachable / host_offline / needs_sign_in, 5 agent_blocked_on_prompt, 6 incompatible_runtime.'
    ],
    examples: ['orca host inventory', 'orca host inventory --json']
  },
  {
    path: ['host', 'rm'],
    destructive: true,
    summary: 'Remove one saved SSH target from this Orca host',
    usage: 'orca host rm --host ssh:<target-id> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'host'],
    notes: [
      'Removes the target the same way Settings does: its connection closes, and the passive ~/.ssh/config import does not add the alias back. Restore removed hosts in Settings brings it back.',
      'Takes only the --host ssh:<target-id> form that `orca host list` prints. This machine and paired Orca servers are refused; remove a paired server with `orca environment rm`.',
      '--environment and --pairing-code are rejected rather than ignored: SSH targets are removed from this machine\u2019s own Orca runtime.'
    ],
    examples: [
      'orca host rm --host ssh:ssh-1783599077486-fyasux',
      'orca host rm --host ssh:ssh-1783599077486-fyasux --json'
    ]
  },
  {
    path: ['environment', 'add'],
    summary: 'Save a remote Orca runtime environment from a pairing code',
    usage: 'orca environment add --name <name> --pairing-code <code> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'pairing-code', 'name'],
    examples: ['orca environment add --name work-laptop --pairing-code orca://pair?code=...']
  },
  {
    path: ['environment', 'list'],
    summary: 'List saved Orca runtime environments',
    usage: 'orca environment list [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    notes: [
      'Answers from this machine\u2019s pairing store. --environment and --pairing-code are rejected rather than ignored, because there is no other host that could answer.'
    ]
  },
  {
    path: ['environment', 'show'],
    summary: 'Show one saved Orca runtime environment',
    usage: 'orca environment show --environment <selector> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'environment']
  },
  {
    path: ['environment', 'rm'],
    destructive: true,
    summary: 'Remove one saved Orca runtime environment',
    usage: 'orca environment rm --environment <selector> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'environment']
  }
]
