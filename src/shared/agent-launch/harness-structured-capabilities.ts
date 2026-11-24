import {
  ACP_SESSION_NEW,
  channels,
  env,
  flag,
  NONE,
  untested,
  type HarnessLaunchCapabilities
} from './harness-launch-capability-types'

export type StructuredHarnessAgent =
  | 'claude'
  | 'codex'
  | 'opencode'
  | 'opencode2'
  | 'omp'
  | 'antigravity'
  | 'kimi'
  | 'copilot'
  | 'grok'

const CLAUDE_FLAGS = channels(
  flag('--append-system-prompt-file'),
  flag('--mcp-config'),
  flag('--plugin-dir', '2.0.25'),
  flag('--settings')
)

export const STRUCTURED_HARNESS_CAPABILITIES: Record<
  StructuredHarnessAgent,
  HarnessLaunchCapabilities
> = {
  claude: {
    transport: 'claude-stream-json',
    channels: CLAUDE_FLAGS,
    readsManagedInstructionFiles: true
  },
  codex: {
    transport: 'codex-app-server',
    channels: channels(
      untested(
        { kind: 'flag', flag: '-c' },
        'developer_instructions via -c: inferred, test on pinned release'
      ),
      untested(
        { kind: 'flag', flag: '-c' },
        'mcp_servers via -c: inferred, test on pinned release'
      ),
      NONE,
      NONE
    ),
    readsManagedInstructionFiles: true
  },
  opencode: {
    transport: 'acp',
    channels: channels(
      untested(env('OPENCODE_CONFIG_CONTENT'), 'instructions via env: not in docs'),
      untested(ACP_SESSION_NEW, 'per-session MCP over ACP unverified'),
      untested(env('OPENCODE_CONFIG_CONTENT'), 'skills via env: used by Orca, not in docs'),
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  opencode2: {
    transport: 'acp',
    channels: channels(
      untested(env('OPENCODE_CONFIG_CONTENT'), 'instructions via env: not in docs'),
      untested(ACP_SESSION_NEW, 'per-session MCP over ACP unverified'),
      untested(env('OPENCODE_CONFIG_CONTENT'), 'skills via env: not in docs, needs 2.0.14'),
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  omp: {
    transport: 'acp',
    channels: channels(
      NONE,
      NONE,
      untested(flag('--plugin-dir'), 'not in omp docs; 18.1.5-18.1.8 skip skills'),
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  antigravity: {
    transport: 'acp',
    channels: channels(
      untested(ACP_SESSION_NEW, 'instructions via session/new: unverified'),
      NONE,
      NONE,
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  kimi: {
    transport: 'acp',
    channels: channels(
      NONE,
      untested(flag('--mcp-config'), 'older kimi-cli docs only; ACP mcpServers unverified'),
      flag('--skills-dir'),
      untested(flag('--config-file'), 'older kimi-cli docs only')
    ),
    readsManagedInstructionFiles: false
  },
  copilot: {
    transport: 'acp',
    channels: channels(
      untested(env('COPILOT_CUSTOM_INSTRUCTIONS_DIRS'), 'instruction dirs via env: unverified'),
      flag('--additional-mcp-config'),
      flag('--plugin-dir'),
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  grok: {
    transport: 'acp',
    channels: channels(
      flag('--rules'),
      NONE,
      untested(flag('--plugin-dir', '1.0.44'), 'repo-gated at 1.0.44; not in the reference'),
      NONE
    ),
    readsManagedInstructionFiles: false
  }
}
