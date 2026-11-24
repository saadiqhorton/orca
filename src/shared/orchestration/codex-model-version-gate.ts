import { compareAppVersions } from '../app-lifecycle/identity/app-version'

/** gpt-6-sol and gpt-6-luna need Codex 0.156.0+. */
export const CODEX_GPT6_SOL_LUNA_MINIMUM_VERSION = '0.156.0'

const VERSION_GATED_CODEX_MODELS: Readonly<Record<string, string>> = {
  'gpt-6-sol': CODEX_GPT6_SOL_LUNA_MINIMUM_VERSION,
  'gpt-6-luna': CODEX_GPT6_SOL_LUNA_MINIMUM_VERSION
}

const KNOWN_CODEX_MODELS: ReadonlySet<string> = new Set([
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-6-astra'
])

const CODEX_MODEL_ID = /^[a-z0-9][a-z0-9._-]*$/i
/** Spoken "gpt 6.2 luna" and dotted gpt-6.N ids are not Codex provider ids. */
const KNOWN_BAD_CODEX_MODEL = /^gpt-6\.\d+/

export type CodexModelVersionGate =
  | { status: 'ok' }
  | { status: 'tooOld'; model: string; version: string; minimumVersion: string; message: string }
  | { status: 'refused'; model: string; message: string }
  | { status: 'unknown'; model: string; message: string }

export function normalizeCodexModelId(model: string): string {
  return model.trim().toLowerCase().replace(/\s+/g, '-')
}

export function codexModelNeedsVersionProbe(model: string | undefined): boolean {
  if (!model?.trim()) {
    return false
  }
  return normalizeCodexModelId(model) in VERSION_GATED_CODEX_MODELS
}

export function checkCodexModelAgainstVersion(
  model: string | undefined,
  version: string | null | undefined
): CodexModelVersionGate {
  if (!model?.trim()) {
    return { status: 'ok' }
  }
  const id = normalizeCodexModelId(model)
  if (!CODEX_MODEL_ID.test(id) || KNOWN_BAD_CODEX_MODEL.test(id)) {
    return {
      status: 'refused',
      model: id,
      message: `"${id}" is not a Codex model id. Use gpt-6-luna or gpt-6-sol, not a dotted gpt-6.N form.`
    }
  }
  if (!(id in VERSION_GATED_CODEX_MODELS) && !KNOWN_CODEX_MODELS.has(id)) {
    return {
      status: 'unknown',
      model: id,
      message: `Unrecognized Codex model id "${id}". Launch will continue; the first-turn watcher will fail it if the agent rejects the model.`
    }
  }
  const minimumVersion = VERSION_GATED_CODEX_MODELS[id]
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
