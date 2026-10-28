import { useEffect, useState } from 'react'

export interface BatterySummary {
  supported: boolean
  charging: boolean
  level: number
}

interface BatteryLike {
  charging: boolean
  level: number
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

/**
 * Reads the battery of the device. Chromium exposes it, so the desktop app and
 * a browser tab share this hook. Returns null until the first reading.
 */
export function useBattery(): BatterySummary | null {
  const [battery, setBattery] = useState<BatterySummary | null>(null)

  useEffect(() => {
    const batteryNavigator = navigator as Navigator & {
      getBattery?: () => Promise<BatteryLike>
    }

    if (typeof batteryNavigator.getBattery !== 'function') {
      setBattery({ supported: false, charging: false, level: 0 })
      return
    }

    let manager: BatteryLike | null = null
    let disposed = false

    const update = () => {
      if (!manager || disposed)
        return

      setBattery({ supported: true, charging: manager.charging, level: manager.level })
    }

    void batteryNavigator.getBattery().then((next) => {
      if (disposed)
        return

      manager = next
      update()
      manager.addEventListener('levelchange', update)
      manager.addEventListener('chargingchange', update)
    }).catch(() => {
      if (!disposed)
        setBattery({ supported: false, charging: false, level: 0 })
    })

    return () => {
      disposed = true
      manager?.removeEventListener('levelchange', update)
      manager?.removeEventListener('chargingchange', update)
    }
  }, [])

  return battery
}
