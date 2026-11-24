import {
  ACP_SESSION_NEW,
  channels,
  env,
  flag,
  NONE,
  NO_CHANNELS,
  untested,
  type HarnessLaunchCapabilities
} from './harness-launch-capability-types'
import type { StructuredHarnessAgent } from './harness-structured-capabilities'
import type { TuiAgent } from './catalog/tui-agent'

export const TUI_HARNESS_CAPABILITIES: Record<
  Exclude<TuiAgent, StructuredHarnessAgent>,
  HarnessLaunchCapabilities
> = {
  'claude-agent-teams': {
    transport: 'tui',
    channels: channels(
      untested(flag('--append-system-prompt-file'), 'wrapper forwards argv: unverified'),
      untested(flag('--mcp-config'), 'wrapper forwards argv: unverified'),
      untested(flag('--plugin-dir', '2.0.25'), 'wrapper forwards argv: unverified'),
      untested(flag('--settings'), 'wrapper forwards argv: unverified')
    ),
    readsManagedInstructionFiles: false
  },
  codebuddy: {
    transport: 'tui',
    channels: channels(NONE, flag('--mcp-config'), flag('--plugin-dir'), NONE),
    readsManagedInstructionFiles: false
  },
  openclaude: { transport: 'tui', channels: NO_CHANNELS, readsManagedInstructionFiles: false },
  autohand: {
    transport: 'tui',
    channels: channels(
      flag('--append-system-prompt-file'),
      flag('--mcp-config'),
      flag('--plugin-dir'),
      untested(flag('--set'), 'hooks per process unverified')
    ),
    readsManagedInstructionFiles: false
  },
  'mimo-code': {
    transport: 'tui',
    channels: channels(
      NONE,
      NONE,
      NONE,
      untested(env('MIMOCODE_CONFIG_DIR'), 'config-dir overlay: not in docs')
    ),
    readsManagedInstructionFiles: false
  },
  pi: {
    transport: 'tui',
    channels: channels(flag('--append-system-prompt'), NONE, flag('--skill'), flag('--extension')),
    readsManagedInstructionFiles: false
  },
  qoder: {
    transport: 'tui',
    channels: channels(
      flag('--append-system-prompt'),
      flag('--mcp-config'),
      flag('--plugin-dir'),
      flag('--settings')
    ),
    readsManagedInstructionFiles: false
  },
  'qoder-cn': {
    transport: 'tui',
    channels: channels(
      untested(flag('--append-system-prompt'), 'assumed from international docs; CN docs not read'),
      untested(flag('--mcp-config'), 'assumed from international docs; CN docs not read'),
      untested(flag('--plugin-dir'), 'assumed from international docs; CN docs not read'),
      untested(flag('--settings'), 'assumed from international docs; CN docs not read')
    ),
    readsManagedInstructionFiles: false
  },
  gemini: {
    transport: 'tui',
    channels: channels(
      untested(env('GEMINI_SYSTEM_MD'), 'replaces the system prompt rather than appending'),
      NONE,
      NONE,
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  aider: { transport: 'tui', channels: NO_CHANNELS, readsManagedInstructionFiles: false },
  goose: {
    transport: 'tui',
    channels: channels(NONE, flag('--with-extension'), NONE, NONE),
    readsManagedInstructionFiles: false
  },
  amp: {
    transport: 'tui',
    channels: channels(
      NONE,
      untested(flag('--settings-file'), 'amp.mcpServers honoured from this file: unverified'),
      NONE,
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  kilo: {
    transport: 'tui',
    channels: channels(
      untested(ACP_SESSION_NEW, 'kilo acp not used by Orca: unverified'),
      NONE,
      NONE,
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  kiro: {
    transport: 'tui',
    channels: channels(
      untested(flag('--agent'), 'agent prompt; --agent not documented for chat'),
      untested(ACP_SESSION_NEW, 'session/new mcpServers; Orca does not use kiro acp'),
      NONE,
      untested(flag('--agent'), 'agent hooks; --agent not documented for chat')
    ),
    readsManagedInstructionFiles: false
  },
  crush: {
    transport: 'tui',
    channels: channels(
      NONE,
      untested(env('CRUSH_GLOBAL_CONFIG'), 'config file merge behaviour unverified'),
      env('CRUSH_SKILLS_DIR'),
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  aug: {
    transport: 'tui',
    channels: channels(flag('--append-system-prompt'), flag('--mcp-config'), flag('--skill'), NONE),
    readsManagedInstructionFiles: false
  },
  cline: {
    transport: 'tui',
    channels: channels(
      untested(flag('--system'), 'replaces the default prompt rather than appending'),
      env('CLINE_MCP_SETTINGS_PATH'),
      NONE,
      flag('--hooks-dir')
    ),
    readsManagedInstructionFiles: false
  },
  codebuff: { transport: 'tui', channels: NO_CHANNELS, readsManagedInstructionFiles: false },
  freebuff: { transport: 'tui', channels: NO_CHANNELS, readsManagedInstructionFiles: false },
  'command-code': {
    transport: 'tui',
    channels: channels(
      NONE,
      NONE,
      NONE,
      untested(flag('--config'), 'hooks key via --config unverified')
    ),
    readsManagedInstructionFiles: false
  },
  continue: {
    transport: 'tui',
    channels: channels(
      flag('--rule'),
      untested(flag('--config'), '--config meaning differs across docs'),
      NONE,
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  cursor: {
    transport: 'tui',
    channels: channels(NONE, NONE, flag('--plugin-dir'), NONE),
    readsManagedInstructionFiles: false
  },
  droid: {
    transport: 'tui',
    channels: channels(flag('--append-system-prompt-file'), NONE, NONE, flag('--settings')),
    readsManagedInstructionFiles: false
  },
  'mistral-vibe': {
    transport: 'tui',
    channels: channels(
      untested(env('VIBE_HOME'), 'prompts overlay via VIBE_HOME: documented, not run'),
      untested(env('VIBE_HOME'), 'config.toml overlay via VIBE_HOME: not run'),
      untested(env('VIBE_SKILL_PATHS'), 'list format unverified'),
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  'qwen-code': {
    transport: 'tui',
    channels: channels(
      flag('--append-system-prompt'),
      flag('--mcp-config'),
      flag('--plugin-dir'),
      flag('--settings')
    ),
    readsManagedInstructionFiles: false
  },
  rovo: {
    transport: 'tui',
    channels: channels(
      NONE,
      NONE,
      NONE,
      untested(flag('--config-file'), 'hooks or MCP via overlay unverified')
    ),
    readsManagedInstructionFiles: false
  },
  hermes: {
    transport: 'tui',
    channels: channels(NONE, NONE, NONE, untested(env('HERMES_HOME'), 'used by Orca, not in docs')),
    readsManagedInstructionFiles: false
  },
  openclaw: { transport: 'tui', channels: NO_CHANNELS, readsManagedInstructionFiles: false },
  muse: { transport: 'tui', channels: NO_CHANNELS, readsManagedInstructionFiles: false },
  devin: {
    transport: 'tui',
    channels: channels(
      NONE,
      NONE,
      NONE,
      untested(flag('--config'), 'hooks accepted via --config: unverified')
    ),
    readsManagedInstructionFiles: false
  },
  ante: {
    transport: 'tui',
    channels: channels(
      untested(flag('--append-system-prompt'), 'source is not clearly the official Ante docs'),
      NONE,
      NONE,
      NONE
    ),
    readsManagedInstructionFiles: false
  },
  trae: { transport: 'tui', channels: NO_CHANNELS, readsManagedInstructionFiles: false },
  zcode: { transport: 'tui', channels: NO_CHANNELS, readsManagedInstructionFiles: false },
  'prime-agent': { transport: 'tui', channels: NO_CHANNELS, readsManagedInstructionFiles: false },
  dsh: {
    transport: 'tui',
    channels: channels(
      NONE,
      NONE,
      NONE,
      untested(flag('--patch'), 'mirror of help text; check official site')
    ),
    readsManagedInstructionFiles: false
  },
  jcode: {
    transport: 'tui',
    channels: channels(NONE, NONE, NONE, untested(env('JCODE_HOME'), 'used by Orca, not in docs')),
    readsManagedInstructionFiles: false
  }
}
