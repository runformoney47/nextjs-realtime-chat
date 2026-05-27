import React, { useRef, useState } from 'react'
import { View, Animated, PanResponder, PanResponderGestureState } from 'react-native'

const ROW_H = 64
const GAP = 6
const STEP = ROW_H + GAP

interface Props<T> {
  /** Initial items — component manages order internally after mount. */
  items: T[]
  keyExtractor: (item: T) => string
  renderItem: (item: T, rank: number, isActive: boolean) => React.ReactNode
  /** Called with the new ordered array whenever a drag completes. */
  onReorder: (newItems: T[]) => void
}

export default function DragToReorder<T>({
  items: initialItems,
  keyExtractor,
  renderItem,
  onReorder,
}: Props<T>) {
  // ─── Internal order state (NOT controlled by parent) ──────────

  // Each entry: { item, key, y: AnimatedValue, scale: AnimatedValue }
  const [entries, setEntries] = useState(() =>
    initialItems.map((item, i) => ({
      item,
      key: keyExtractor(item),
      y: new Animated.Value(0),
      scale: new Animated.Value(1),
      homeSlot: i, // the slot this entry "lives" in (updated after each drop)
    })),
  )

  const entriesRef = useRef(entries)
  entriesRef.current = entries

  const activeKey = useRef<string | null>(null)
  const orderKeys = useRef(entries.map((e) => e.key)) // current visual order by key
  const [, bump] = useState(0)
  const rerender = () => bump((n) => n + 1)

  const slotY = (slot: number) => slot * STEP

  const findEntry = (key: string) => entriesRef.current.find((e) => e.key === key)!
  const findSlot = (key: string) => orderKeys.current.indexOf(key)

  // Animate all non-active entries to their correct slots
  const layoutOthers = (activeKeyVal: string) => {
    const ord = orderKeys.current
    ord.forEach((key, slot) => {
      if (key === activeKeyVal) return
      const entry = findEntry(key)
      Animated.timing(entry.y, {
        toValue: slotY(slot) - slotY(entry.homeSlot),
        duration: 120,
        useNativeDriver: true,
      }).start()
    })
  }

  // Build one PanResponder per entry (stable, keyed to the entry)
  const respondersMap = useRef(new Map<string, ReturnType<typeof PanResponder.create>>())

  const getResponder = (entryKey: string) => {
    if (respondersMap.current.has(entryKey)) return respondersMap.current.get(entryKey)!

    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 2,

      onPanResponderGrant: () => {
        activeKey.current = entryKey
        rerender()
        const entry = findEntry(entryKey)
        Animated.timing(entry.scale, {
          toValue: 1.04,
          duration: 80,
          useNativeDriver: true,
        }).start()
      },

      onPanResponderMove: (_: any, gs: PanResponderGestureState) => {
        const key = activeKey.current
        if (key !== entryKey) return

        const entry = findEntry(key)
        // Card follows finger: offset from its home position
        entry.y.setValue(gs.dy)

        // Which slot is the finger over?
        const fingerCenter = slotY(entry.homeSlot) + gs.dy + ROW_H / 2
        const targetSlot = Math.max(
          0,
          Math.min(entriesRef.current.length - 1, Math.floor(fingerCenter / STEP)),
        )

        const currentSlot = findSlot(key)
        if (currentSlot !== targetSlot) {
          const ord = [...orderKeys.current]
          ord.splice(currentSlot, 1)
          ord.splice(targetSlot, 0, key)
          orderKeys.current = ord
          layoutOthers(key)
        }
      },

      onPanResponderRelease: () => {
        const key = activeKey.current
        if (key !== entryKey) return

        // Finalize: update homeSlots to match the new order, reset all offsets
        const ord = orderKeys.current
        const newEntries = entriesRef.current.map((entry) => {
          const newSlot = ord.indexOf(entry.key)
          entry.y.setValue(0)
          entry.scale.setValue(1)
          entry.homeSlot = newSlot
          return entry
        })

        activeKey.current = null
        entriesRef.current = newEntries
        setEntries([...newEntries])

        // Notify parent
        const newItems = ord.map((k) => findEntry(k).item)
        onReorder(newItems)
      },

      onPanResponderTerminate: () => {
        // Reset everything to home positions
        entriesRef.current.forEach((entry) => {
          entry.y.setValue(0)
          entry.scale.setValue(1)
        })
        orderKeys.current = entriesRef.current.map((e) => e.key)
        activeKey.current = null
        rerender()
      },
    })

    respondersMap.current.set(entryKey, responder)
    return responder
  }

  return (
    <View style={{ height: entries.length * STEP }}>
      {entries.map((entry) => {
        const isActive = activeKey.current === entry.key
        const displayRank = orderKeys.current.indexOf(entry.key)

        return (
          <Animated.View
            key={entry.key}
            {...getResponder(entry.key).panHandlers}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: slotY(entry.homeSlot),
              height: ROW_H,
              zIndex: isActive ? 100 : 1,
              transform: [
                { translateY: entry.y },
                { scale: entry.scale },
              ],
              ...(isActive
                ? {
                    shadowColor: '#4F46E5',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.25,
                    shadowRadius: 10,
                  }
                : {}),
            }}
          >
            {renderItem(entry.item, displayRank, isActive)}
          </Animated.View>
        )
      })}
    </View>
  )
}
