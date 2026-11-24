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
  if (!args.owned?.length) {
    return args.defaultArgs ?? null
  }
  const defaults = args.defaultArgs?.trim()
    ? tokenizeStartupCommand(args.defaultArgs.trim(), args.shell)
    : { ok: true as const, tokens: [] as string[] }
  if (!defaults.ok) {
    throw new Error(`Default agent arguments are invalid: ${defaults.error}`)
  }
  const already = new Set(defaults.tokens)
  const inserted = args.owned.filter((token, index) => {
    if (!token.startsWith('-')) {
      return args.owned![index - 1] === undefined || already.has(args.owned![index - 1]!)
        ? !already.has(token)
        : true
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
