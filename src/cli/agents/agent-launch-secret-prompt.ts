const SECRET_IN_PROMPT =
  /(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{20,})/

export function launchPromptLooksSecret(prompt: string): boolean {
  return SECRET_IN_PROMPT.test(prompt)
}

/** Warn, never refuse: a false positive must not block a launch. */
export function warnIfLaunchPromptLooksSecret(flags: ReadonlyMap<string, string | boolean>): void {
  const prompt = flags.get('prompt')
  if (typeof prompt !== 'string' || !launchPromptLooksSecret(prompt)) {
    return
  }
  process.stderr.write(
    'warning: --prompt looks like it contains a secret or token. Do not put credentials in launch prompts; pass them via a file or environment variable on the target host.\n'
  )
}
