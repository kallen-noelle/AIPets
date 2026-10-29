import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface DragOffset {
  x: number
  y: number
}

interface DragState {
  x: number
  y: number
  vx: number
  vy: number
  dragging: boolean
  moved: number
  pointerId: number | null
  lastX: number
  lastY: number
  lastScreenX: number
  lastScreenY: number
  lastTime: number
  frame: number
}

export interface DragPhysicsOptions {
  /**
   * Moves the browser window with the pointer instead of the element. The
   * desktop pet uses this, so the character never leaves its frame.
   */
  moveWindow?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}

const friction = 0.94
const restitution = 0.55
const flingThreshold = 380

/**
 * Drags and throws an element with pointer input.
 *
 * A release above the fling threshold keeps the velocity and bounces off the
 * window edges. The element stops where it lands and never returns to its
 * start position.
 */
export function useDragPhysics(targetRef: RefObject<HTMLElement | null>, options: DragPhysicsOptions = {}) {
  const { moveWindow = false, onDragStart, onDragEnd } = options
  const callbacks = useRef({ onDragStart, onDragEnd })
  useEffect(() => {
    callbacks.current = { onDragStart, onDragEnd }
  }, [onDragStart, onDragEnd])
  const [offset, setOffset] = useState<DragOffset>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const state = useRef<DragState>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    dragging: false,
    moved: 0,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    lastScreenX: 0,
    lastScreenY: 0,
    lastTime: 0,
    frame: 0,
  })

  const stop = useCallback(() => {
    if (state.current.frame)
      cancelAnimationFrame(state.current.frame)
    state.current.frame = 0
  }, [])

  const bounds = useCallback(() => {
    const element = targetRef.current
    if (!element)
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 }

    const rect = element.getBoundingClientRect()
    const baseLeft = rect.left - state.current.x
    const baseTop = rect.top - state.current.y
    const baseRight = rect.right - state.current.x
    const baseBottom = rect.bottom - state.current.y

    return {
      minX: -baseLeft,
      maxX: window.innerWidth - baseRight,
      minY: -baseTop,
      maxY: window.innerHeight - baseBottom,
    }
  }, [targetRef])

  const run = useCallback(() => {
    const current = state.current
    let previous = performance.now()

    const step = (now: number) => {
      const dt = Math.min(0.032, (now - previous) / 1000)
      previous = now

      const limit = bounds()
      current.x += current.vx * dt
      current.y += current.vy * dt

      current.vx *= friction ** (dt * 60)
      current.vy *= friction ** (dt * 60)

      if (current.x < limit.minX) {
        current.x = limit.minX
        current.vx = Math.abs(current.vx) * restitution
      }
      else if (current.x > limit.maxX) {
        current.x = limit.maxX
        current.vx = -Math.abs(current.vx) * restitution
      }

      if (current.y < limit.minY) {
        current.y = limit.minY
        current.vy = Math.abs(current.vy) * restitution
      }
      else if (current.y > limit.maxY) {
        current.y = limit.maxY
        current.vy = -Math.abs(current.vy) * restitution
      }

      setOffset({ x: current.x, y: current.y })

      if (Math.hypot(current.vx, current.vy) < 2) {
        current.vx = 0
        current.vy = 0
        current.frame = 0
        return
      }

      current.frame = requestAnimationFrame(step)
    }

    current.frame = requestAnimationFrame(step)
  }, [bounds])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0)
      return

    stop()
    event.currentTarget.setPointerCapture(event.pointerId)

    const current = state.current
    current.dragging = true
    current.moved = 0
    current.pointerId = event.pointerId
    current.lastX = event.clientX
    current.lastY = event.clientY
    current.lastScreenX = event.screenX
    current.lastScreenY = event.screenY
    current.lastTime = performance.now()
    current.vx = 0
    current.vy = 0
    setDragging(true)

    if (moveWindow)
      callbacks.current.onDragStart?.()
  }, [moveWindow, stop])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = state.current
    if (!current.dragging)
      return

    if (moveWindow) {
      // The window follows the cursor, so only the screen position shows how
      // far the gesture moved. That distance separates a click from a drag.
      current.moved += Math.abs(event.screenX - current.lastScreenX)
        + Math.abs(event.screenY - current.lastScreenY)
      current.lastScreenX = event.screenX
      current.lastScreenY = event.screenY
      return
    }

    const now = performance.now()
    const dx = event.clientX - current.lastX
    const dy = event.clientY - current.lastY
    const dt = Math.max(8, now - current.lastTime) / 1000

    current.vx = current.vx * 0.7 + (dx / dt) * 0.3
    current.vy = current.vy * 0.7 + (dy / dt) * 0.3
    current.x += dx
    current.y += dy
    current.moved += Math.abs(dx) + Math.abs(dy)
    current.lastX = event.clientX
    current.lastY = event.clientY
    current.lastTime = now

    setOffset({ x: current.x, y: current.y })
  }, [])

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = state.current
    if (!current.dragging)
      return

    current.dragging = false
    current.pointerId = null
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)

    if (moveWindow) {
      callbacks.current.onDragEnd?.()
      return
    }

    if (Math.hypot(current.vx, current.vy) < flingThreshold) {
      current.vx = 0
      current.vy = 0
    }

    run()
  }, [moveWindow, run])

  /** True when the last pointer gesture moved past the click threshold. */
  const didDrag = useCallback(() => state.current.moved > 6, [])

  useEffect(() => stop, [stop])

  return {
    offset,
    dragging,
    didDrag,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  }
}
