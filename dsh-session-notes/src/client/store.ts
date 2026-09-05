/**
 * Self-contained observable store + React binding. No dependency on the
 * runtime's defineStore engine — plain getSnapshot/subscribe semantics are
 * all useSyncExternalStore needs.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react'

/** Minimal external store. */
export class Store {
  /** @param {S} initial */
  constructor(initial) {
    this.state = initial
    /** @type {Set<() => void>} */
    this.listeners = new Set()
  }

  /** @returns {S} */
  getSnapshot() {
    return this.state
  }

  /** @param {() => void} fn @returns {() => void} unsubscribe */
  subscribe(fn) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /**
   * Apply one state transform and notify when the snapshot changes.
   * @param {(draft: S) => S} transform
   */
  set(transform) {
    const next = transform(this.state)
    if (next !== this.state) {
      this.state = next
      for (const listener of this.listeners) listener()
    }
  }
}

/**
 * Bind a store to a selector hook with cached selection so referentially
 * stable derived values never loop useSyncExternalStore.
 * @template S, T
 * @param {Store<S>} store
 * @returns {(selector: (state: S) => T, isEqual?: (a: T, b: T) => boolean) => T}
 */
export function bindSelector(store) {
  return function useSelector(selector, isEqual = (a, b) => a === b) {
    const selectorRef = useRef(selector)
    selectorRef.current = selector
    const isEqualRef = useRef(isEqual)
    isEqualRef.current = isEqual
    const cache = useRef({ has: false, state: undefined, selected: undefined })
    const getSelected = useCallback(() => {
      const state = store.getSnapshot()
      const last = cache.current
      if (last.has && Object.is(last.state, state)) return last.selected
      const selected = selectorRef.current(state)
      if (last.has && isEqualRef.current(last.selected, selected)) {
        cache.current = { has: true, state, selected: last.selected }
        return last.selected
      }
      cache.current = { has: true, state, selected }
      return selected
    }, [store])
    return useSyncExternalStore(
      useCallback((fn) => store.subscribe(fn), [store]),
      getSelected,
      getSelected,
    )
  }
}
