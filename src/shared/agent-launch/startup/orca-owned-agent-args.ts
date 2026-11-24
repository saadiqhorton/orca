import { agentArgTerminatorIndex } from '../../agent-session/options/launch/agent-session-option-agent-args'
import type { TuiAgent } from '../catalog/tui-agent'
import {
  quoteStartupArg,
  tokenizeStartupCommand,
  type AgentStartupShell
} from './tui-agent-startup-shell'

/** Orca-owned argv, such as Claude host-instruction flags, must not go through the user extra-args allowlist. */
export function mergeOrcaOwnedAgentArgs(args: {
  agent: TuiAgent
  defaultArgs: string | null | undefined
  owned: readonly string[] | undefined
  shell: AgentStartupShell
}): string | null {
  const owned = args.owned
  if (!owned?.length) {
    return args.defaultArgs ?? null
  }
  const emptyDefaults = { ok: true as const, tokens: [] satisfies string[] }
  const defaults = args.defaultArgs?.trim()
    ? tokenizeStartupCommand(args.defaultArgs.trim(), args.shell)
    : emptyDefaults
  if (!defaults.ok) {
    throw new Error(`Default agent arguments are invalid: ${defaults.error}`)
  }
  const already = new Set(defaults.tokens)
  const inserted = owned.filter((token, index) => {
    if (!token.startsWith('-')) {
      const previous = index > 0 ? owned[index - 1] : undefined
      return previous === undefined || already.has(previous) ? !already.has(token) : true
    }
    return !already.has(token)
  })
  if (inserted.length === 0) {
    return args.defaultArgs ?? null
  }
  const terminator = agentArgTerminatorIndex(args.agent, defaults.tokens)
  const merged = [
    ...defaults.tokens.slice(0, terminator),
    ...inserted,
    ...defaults.tokens.slice(terminator)
  ]
  return merged.map((token) => quoteStartupArg(token, args.shell)).join(' ')
}
