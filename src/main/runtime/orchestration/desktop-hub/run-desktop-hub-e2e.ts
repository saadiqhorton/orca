import { runCrossHostOrchestrationE2e } from './desktop-hub-e2e-scenario'

async function main(): Promise<void> {
  const transcript = await runCrossHostOrchestrationE2e()
  for (const line of transcript.lines) {
    console.log(line)
  }
  if (
    transcript.answerPath !== 'shared-control' ||
    transcript.needsSignIn !== 'needs_sign_in' ||
    transcript.unreachable !== 'host_unreachable' ||
    !transcript.hostname.includes(transcript.marker) ||
    !transcript.hostname.includes('B_CWD=') ||
    transcript.readOutput !== transcript.hostname ||
    !transcript.stopped ||
    transcript.otherSession !== 'session_refused'
  ) {
    console.error(JSON.stringify(transcript, null, 2))
    process.exit(1)
  }
}

if (process.argv[1]?.includes('run-desktop-hub-e2e')) {
  void main()
}
