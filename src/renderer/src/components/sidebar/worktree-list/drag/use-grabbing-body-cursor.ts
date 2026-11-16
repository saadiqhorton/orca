import { useEffect } from 'react'

/** Shows a grabbing cursor and blocks text selection on the page while a header drag is active. */
export function useGrabbingBodyCursor(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return
    }
    const body = document.body
    const prevCursor = body.style.cursor
    const prevUserSelect = body.style.userSelect
    const prevWebkitUserSelect = body.style.webkitUserSelect
    const prevTouchAction = body.style.touchAction
    body.style.cursor = 'grabbing'
    body.style.userSelect = 'none'
    body.style.webkitUserSelect = 'none'
    body.style.touchAction = 'none'
    return () => {
      body.style.cursor = prevCursor
      body.style.userSelect = prevUserSelect
      body.style.webkitUserSelect = prevWebkitUserSelect
      body.style.touchAction = prevTouchAction
    }
  }, [active])
}
