import { compareAppVersions } from '../app-version'

/** gpt-6-sol and gpt-6-luna need Codex 0.156.0+. */
export const CODEX_GPT6_SOL_LUNA_MINIMUM_VERSION = '0.156.0'

const KNOWN_CODEX_MODELS: Readonly<Record<string, string | undefined>> = {
  'gpt-5.4': undefined,
  'gpt-5.3-codex': undefined,
  'gpt-5.2': undefined,
  'gpt-5.1': undefined,
  'gpt-5': undefined,
  'gpt-6-sol': CODEX_GPT6_SOL_LUNA_MINIMUM_VERSION,
  'gpt-6-luna': CODEX_GPT6_SOL_LUNA_MINIMUM_VERSION,
  'gpt-6-astra': undefined
}

export type CodexModelVersionGate =
  | { status: 'ok' }
  | { status: 'tooOld'; model: string; version: string; minimumVersion: string; message: string }
  | { status: 'unknown'; model: string; message: string }

export function normalizeCodexModelId(model: string): string {
  return model.trim().toLowerCase().replace(/\s+/g, '-')
}

export function checkCodexModelAgainstVersion(
  model: string | undefined,
  version: string | null | undefined
): CodexModelVersionGate {
  if (!model?.trim()) {
    return { status: 'ok' }
  }
  const id = normalizeCodexModelId(model)
  const minimumVersion = KNOWN_CODEX_MODELS[id]
  if (!(id in KNOWN_CODEX_MODELS)) {
    return {
      status: 'unknown',
      model: id,
      message: `Unknown Codex model id "${id}". Use the provider id the user named (for example gpt-6-luna), or pick a listed Codex model.`
    }
  }
  if (!minimumVersion || !version) {
    return { status: 'ok' }
  }
  if (compareAppVersions(version, minimumVersion) < 0) {
    return {
      status: 'tooOld',
      model: id,
      version,
      minimumVersion,
      message: `${id} needs Codex ${minimumVersion} or newer; this host has ${version}.`
    }
  }
  return { status: 'ok' }
}
