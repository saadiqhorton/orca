import type { ProfilePreferences } from '../../../persistence/loading-store/profile-preferences/profile-preferences'
import {
  installOrcaHostInstructions,
  orcaHostInstructionPath
} from './orca-host-instruction-install'
import { rememberOrcaInstructionFile } from './orca-host-name-cache'

/** Writes this host's managed instruction block at startup and re-runs when its setting flips. */
export function startManagedHostInstructions(
  store: Pick<ProfilePreferences, 'getSettings' | 'onSettingsChanged'>,
  userDataPath: string
): () => void {
  rememberOrcaInstructionFile(orcaHostInstructionPath(userDataPath))
  const reconcile = (): void => {
    void installOrcaHostInstructions({ userDataPath, settings: store.getSettings() }).catch(
      () => undefined
    )
  }
  reconcile()
  return store.onSettingsChanged((updates) => {
    if ('orcaWriteGlobalAgentInstructions' in updates) {
      reconcile()
    }
  })
}
