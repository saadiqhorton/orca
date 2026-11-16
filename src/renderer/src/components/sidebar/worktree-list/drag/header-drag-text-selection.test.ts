// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { lockPageForHeaderDrag } from './use-grabbing-body-cursor'

function selectText(text: string): HTMLElement {
  const label = document.createElement('span')
  label.textContent = text
  document.body.append(label)
  const range = document.createRange()
  range.setStart(label.firstChild!, 0)
  range.setEnd(label.firstChild!, 6)
  document.getSelection()?.removeAllRanges()
  document.getSelection()?.addRange(range)
  return label
}

afterEach(() => {
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
  document.getSelection()?.removeAllRanges()
})

describe('lockPageForHeaderDrag', () => {
  it('clears a label selection started before the drag promoted', () => {
    selectText('saadiqhorton')
    expect(document.getSelection()?.toString()).toBe('saadiq')
    const release = lockPageForHeaderDrag()
    expect(document.getSelection()?.toString()).toBe('')
    release()
  })

  it('blocks new selections during the drag and leaves none behind after the drop', () => {
    const release = lockPageForHeaderDrag()
    const selectStart = new Event('selectstart', { cancelable: true, bubbles: true })
    document.body.dispatchEvent(selectStart)
    expect(selectStart.defaultPrevented).toBe(true)
    expect(document.body.style.userSelect).toBe('none')
    expect(document.body.style.cursor).toBe('grabbing')
    selectText('saadiqhorton')
    release()
    expect(document.getSelection()?.toString()).toBe('')
  })

  it('restores text selection (rename, inputs) once the drag ends', () => {
    document.body.style.cursor = 'text'
    const release = lockPageForHeaderDrag()
    release()
    expect(document.body.style.cursor).toBe('text')
    expect(document.body.style.userSelect).toBe('')
    const selectStart = new Event('selectstart', { cancelable: true, bubbles: true })
    document.body.dispatchEvent(selectStart)
    expect(selectStart.defaultPrevented).toBe(false)
    selectText('saadiqhorton')
    expect(document.getSelection()?.toString()).toBe('saadiq')
  })
})
