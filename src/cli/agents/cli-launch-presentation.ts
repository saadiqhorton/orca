export function cliLaunchPresentation(args: {
  focus: boolean
  visibleRemote: boolean
}): 'focused' | 'background' | undefined {
  if (args.focus) {
    return 'focused'
  }
  if (args.visibleRemote) {
    return undefined
  }
  return 'background'
}
