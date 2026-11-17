import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORCAD_VERSION, orcadArtifactFilenames } from '../../../../src/shared/orcad-artifacts.ts'
import { readOrcadMobileWebAssetFilenames } from './orcad-mobile-web-bundle.mjs'

/** Content-hash of emitted artifact bytes (first 12 hex), not the git SHA.
 * Two machines building the same commit can produce different `0.1.0+…` ids when
 * mobile-web assets, native addons, or omitted optional files differ. The template
 * manifest also records `sourceCommit` (git HEAD) so those builds can still be
 * compared as the same source. The runtime enters through `.runtime-node`'s
 * executableSha256 string, never its bytes (design D2). */
export function computeOrcadFullVersion(artifactDir, { target, agentBrowserFilename }) {
  const hash = createHash('sha256')
  for (const filename of orcadArtifactFilenames(
    target,
    readOrcadMobileWebAssetFilenames(artifactDir)
  )) {
    const artifactPath = join(artifactDir, filename)
    if (!existsSync(artifactPath)) {
      throw new Error(
        `orcad declares ${filename} in ORCAD_ARTIFACTS but never emitted it. Add the build ` +
          'step, or drop it from src/shared/orcad-artifacts.ts.'
      )
    }
    hash.update(readFileSync(artifactPath))
  }
  if (agentBrowserFilename && existsSync(join(artifactDir, agentBrowserFilename))) {
    hash.update(readFileSync(join(artifactDir, agentBrowserFilename)))
  }
  return `${ORCAD_VERSION}+${hash.digest('hex').slice(0, 12)}`
}
