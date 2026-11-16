import { useEffect } from 'react'

/** Shows a grabbing cursor and blocks text selection on the page while a header drag is active. */
export function useGrabbingBodyCursor(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return
    }
    const body = document.body
    const { cursor: prevCursor, userSelect: prevUserSelect } = body.style
    body.style.cursor = 'grabbing'
    body.style.userSelect = 'none'
    return () => {
      body.style.cursor = prevCursor
      body.style.userSelect = prevUserSelect
    }
  }, [active])
}
