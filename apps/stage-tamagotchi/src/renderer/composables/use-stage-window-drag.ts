import { defineInvoke } from '@moeru/eventa'
import { useElectronEventaContext } from '@proj-airi/electron-vueuse'
import { useEventListener } from '@vueuse/core'
import { isLinux } from 'std-env'

import { electronStartDraggingWindow } from '../../shared/eventa'

export interface StageWindowDragOptions {
  /** Returns true when a press may move the window. */
  canStartDrag: () => boolean
  /** Movement below this stays a click. */
  thresholdPx?: number
}

/**
 * Drags the desktop window by pressing the character.
 *
 * The press must start on the character, and the pointer must move past
 * `thresholdPx`, so a poke still reaches the renderer. Linux keeps the title-bar
 * drag because the Electron workaround supports Windows and macOS only.
 */
export function useStageWindowDrag(options: StageWindowDragOptions) {
  const context = useElectronEventaContext()
  const startDraggingWindow = !isLinux
    ? defineInvoke(context.value, electronStartDraggingWindow)
    : undefined

  const thresholdPx = options.thresholdPx ?? 4
  let start: { x: number, y: number } | null = null
  let dragging = false

  function reset() {
    start = null
    dragging = false
  }

  useEventListener(window, 'pointerdown', (event) => {
    reset()
    if (event.button !== 0 || !startDraggingWindow || !options.canStartDrag())
      return

    start = { x: event.clientX, y: event.clientY }
  })

  useEventListener(window, 'pointermove', (event) => {
    if (!start || dragging)
      return

    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= thresholdPx)
      return

    dragging = true
    start = null
    void startDraggingWindow?.()
  })

  useEventListener(window, 'pointerup', reset)
  useEventListener(window, 'pointercancel', reset)
}
