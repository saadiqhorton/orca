/** A desktop-connected machine name. `local`, `ssh:`, and `runtime:` keep their existing command routes. */
export function isDesktopHubHostValue(value: string | boolean | undefined): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value !== 'local' &&
    !value.startsWith('ssh:') &&
    !value.startsWith('runtime:')
  )
}
