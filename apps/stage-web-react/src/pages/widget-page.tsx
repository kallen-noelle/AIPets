import type { CSSProperties } from 'react'

import type { DesktopPowerState } from '../desktop/bridge'

import { errorMessageFrom } from '@moeru/std'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getDesktopBridge } from '../desktop/bridge'
import { useBattery } from '../desktop/use-battery'

/** The window has no frame, so the header is the drag handle. */
const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties

const buttonClass = [
  'rounded-xl border border-[var(--aipets-border)] px-2.5 py-1 text-[11px] transition',
  'hover:bg-[var(--aipets-hover)] disabled:opacity-40',
].join(' ')

/**
 * The small always-on-top window. It shows the clock, the power state, and the
 * two actions a user wants without opening the whole settings window.
 */
export function WidgetPage() {
  const { t } = useTranslation()
  const bridge = getDesktopBridge()
  const battery = useBattery()

  const [power, setPower] = useState<DesktopPowerState | null>(null)
  const [petVisible, setPetVisible] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!bridge)
      return

    void bridge.getPowerState().then(setPower)
    void bridge.getInfo().then(info => setPetVisible(info.visible))

    return bridge.onPowerEvent(() => {
      void bridge.getPowerState().then(setPower)
    })
  }, [bridge])

  const run = async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
    }
    catch (cause) {
      setError(errorMessageFrom(cause) ?? 'unknown error')
    }
  }

  const togglePet = () => run(async () => {
    if (!bridge)
      return

    setPetVisible(await bridge.setVisible(!petVisible))
  })

  return (
    <div className="h-screen w-screen bg-transparent p-2">
      <div
        className={[
          'flex h-full flex-col gap-3 rounded-2xl border border-[var(--aipets-border)] p-4',
          'bg-[rgba(16,16,22,0.86)] text-[var(--aipets-fg)]',
        ].join(' ')}
      >
        <header className="flex items-start justify-between gap-2" style={dragStyle}>
          <div>
            <p className="text-lg font-semibold leading-tight">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-[11px] text-[var(--aipets-muted)]">
              {t('settings.reactShell.widgetTitle', { defaultValue: 'aipetdex widget' })}
            </p>
          </div>

          <button
            type="button"
            className={buttonClass}
            style={noDragStyle}
            onClick={() => void bridge?.closeWindow('widget')}
          >
            {t('settings.reactShell.closeWindow', { defaultValue: 'Close' })}
          </button>
        </header>

        <div className="flex flex-col gap-2 text-xs">
          {battery?.supported && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[var(--aipets-muted)]">
                  {t('settings.reactShell.batteryLevel', { defaultValue: 'Battery level' })}
                </span>
                <span className="font-semibold">
                  {Math.round(battery.level * 100)}
                  %
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--aipets-hover)]">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{ width: `${Math.round(battery.level * 100)}%` }}
                />
              </div>
            </>
          )}

          {power && (
            <p className="text-[11px] text-[var(--aipets-muted)]">
              {power.onBatteryPower
                ? t('settings.reactShell.batteryDischarging', { defaultValue: 'On battery' })
                : t('settings.reactShell.acPowerLine', { defaultValue: 'AC power' })}
              {' · '}
              {t('settings.reactShell.idleState', { defaultValue: 'Idle state' })}
              {': '}
              {power.idleState}
            </p>
          )}
        </div>

        {error && <p className="text-[11px] text-rose-400">{error}</p>}

        <div className="mt-auto flex flex-wrap gap-2" style={noDragStyle}>
          <button type="button" className={buttonClass} onClick={() => void togglePet()}>
            {petVisible
              ? t('settings.reactShell.hidePet', { defaultValue: 'Hide pet' })
              : t('settings.reactShell.showPet', { defaultValue: 'Show pet' })}
          </button>

          <button
            type="button"
            className={buttonClass}
            onClick={() => void run(async () => {
              await bridge?.openWindow('settings')
            })}
          >
            {t('settings.reactShell.openSettingsWindow', { defaultValue: 'Settings' })}
          </button>
        </div>
      </div>
    </div>
  )
}
