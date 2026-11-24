import { normalizeTypedName } from '../text/typed-name-normalization'

export type SameMachineEnvironment = {
  id: string
  name: string
  orcadDeployment?: { sshTargetId?: string } | null
  endpoints?: readonly { endpoint: string }[]
}

export type SameMachineSshTarget = {
  id: string
  label: string
  host?: string
}

/** Prefer the paired server when --host names both it and an SSH alias for the same machine. */
export function preferPairedServerForSameMachine(
  environment: SameMachineEnvironment,
  sshTargets: readonly SameMachineSshTarget[]
): SameMachineSshTarget | undefined {
  const matched = sshTargets.filter((target) => namesSameMachine(environment, target))
  return matched.length === 1 ? matched[0] : undefined
}

export function namesSameMachine(
  environment: SameMachineEnvironment,
  target: SameMachineSshTarget
): boolean {
  const deployed = environment.orcadDeployment?.sshTargetId
  if (deployed === target.id) {
    return true
  }
  const names = new Set(
    [environment.name, target.label, target.host, ...endpointHosts(environment.endpoints)]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map(normalizeTypedName)
  )
  const targetNames = [target.id, target.label, target.host]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(normalizeTypedName)
  const envNames = [environment.id, environment.name, ...endpointHosts(environment.endpoints)].map(
    (value) => normalizeTypedName(value)
  )
  return targetNames.some((name) => envNames.includes(name)) && names.size > 0
}

function endpointHosts(endpoints: readonly { endpoint: string }[] | undefined): string[] {
  if (!endpoints) {
    return []
  }
  const hosts: string[] = []
  for (const row of endpoints) {
    try {
      const host = new URL(row.endpoint).hostname
      if (host) {
        hosts.push(host)
      }
    } catch {
      // Pairing endpoints may be opaque tokens, not URLs.
    }
  }
  return hosts
}
