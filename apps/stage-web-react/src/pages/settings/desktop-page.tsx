import type { VoiceActivityDetector, VoiceActivityState } from '../../audio/pipeline'
import type {
  DesktopDisplay,
  DesktopPowerEvent,
  DesktopPowerState,
  DesktopWindowKind,
  DesktopWindowSummary,
} from '../../desktop/bridge'

import { errorMessageFrom } from '@moeru/std'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { audioToggleKeys, createVoiceActivityDetector, openMicrophone } from '../../audio/pipeline'
import { PageHeader, SectionCard, SelectField, ToggleField } from '../../components/fields'
import { getDesktopBridge } from '../../desktop/bridge'
import { useBattery } from '../../desktop/use-battery'
import { useStoredValue } from '../../settings/persisted'

const inputDeviceStorageKey = 'aipets:react:audio/input-device'
const outputDeviceStorageKey = 'aipets:react:audio/output-device'

const buttonClass = [
  'rounded-xl border border-[var(--aipets-border)] px-3 py-1.5 text-xs transition',
  'hover:bg-[var(--aipets-hover)] disabled:opacity-40',
].join(' ')

const windowLabels: Record<DesktopWindowKind, string> = {
  main: 'Pet',
  settings: 'Settings',
  widget: 'Widget',
  chat: 'Chat',
}

interface MicrophoneMonitor {
  stream: MediaStream
  detector: VoiceActivityDetector
  unsubscribe: () => void
}

export function DesktopPage() {
  const { t } = useTranslation()
  const bridge = getDesktopBridge()
  const battery = useBattery()

  const [closeToTray, setCloseToTray] = useState(true)
  const [power, setPower] = useState<DesktopPowerState | null>(null)
  const [lastPowerEvent, setLastPowerEvent] = useState<DesktopPowerEvent | null>(null)
  const [displays, setDisplays] = useState<DesktopDisplay[]>([])
  const [windows, setWindows] = useState<DesktopWindowSummary[]>([])
  const [windowError, setWindowError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [inputDevice, setInputDevice] = useStoredValue(inputDeviceStorageKey, '')
  const [outputDevice, setOutputDevice] = useStoredValue(outputDeviceStorageKey, '')
  const [echoCancellation, setEchoCancellation] = useStoredValue(audioToggleKeys.echoCancellation, true)
  const [noiseSuppression, setNoiseSuppression] = useStoredValue(audioToggleKeys.noiseSuppression, true)
  const [autoGainControl, setAutoGainControl] = useStoredValue(audioToggleKeys.autoGainControl, true)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [monitoring, setMonitoring] = useState(false)
  const [micBusy, setMicBusy] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [activity, setActivity] = useState<VoiceActivityState | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const monitorRef = useRef<MicrophoneMonitor | null>(null)

  useEffect(() => {
    if (!bridge)
      return

    void bridge.getPreferences().then(next => setCloseToTray(next.closeToTray))
    void bridge.getPowerState().then(setPower)
    void bridge.listDisplays().then(setDisplays)
    void bridge.listWindows().then(setWindows)

    const unsubscribers = [
      bridge.onPowerEvent((event) => {
        setLastPowerEvent(event)
        void bridge.getPowerState().then(setPower)
      }),
      bridge.onDisplaysChanged(setDisplays),
      bridge.onWindowsChanged(setWindows),
      bridge.onPreferencesChanged(next => setCloseToTray(next.closeToTray)),
    ]

    return () => {
      for (const unsubscribe of unsubscribers)
        unsubscribe()
    }
  }, [bridge])

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setDevices(list.filter(device => device.kind === 'audioinput' || device.kind === 'audiooutput'))
    }
    catch {
      setDevices([])
    }
  }, [])

  useEffect(() => {
    void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
    }
  }, [refreshDevices])

  useEffect(() => {
    if (videoRef.current)
      videoRef.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach(track => track.stop())
    }
  }, [stream])

  const stopMonitoring = useCallback(() => {
    const current = monitorRef.current
    if (!current)
      return

    monitorRef.current = null
    current.unsubscribe()
    current.detector.stop()
    current.stream.getTracks().forEach(track => track.stop())
    setMonitoring(false)
    setActivity(null)
  }, [])

  // A monitor must not keep the microphone open after the page closes.
  useEffect(() => stopMonitoring, [stopMonitoring])

  const setTrayPreference = async (next: boolean) => {
    setCloseToTray(next)
    if (bridge)
      await bridge.setPreferences({ closeToTray: next })
  }

  /** Runs one window command and replaces the list with the main reply. */
  const applyWindows = async (action: () => Promise<DesktopWindowSummary[]>) => {
    setWindowError(null)
    try {
      setWindows(await action())
    }
    catch (cause) {
      setWindowError(errorMessageFrom(cause) ?? 'unknown error')
    }
  }

  const startCapture = async () => {
    setCaptureError(null)
    setCapturing(true)

    try {
      const next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      next.getVideoTracks()[0]?.addEventListener('ended', () => setStream(null))
      setStream(next)
    }
    catch (error) {
      setCaptureError(errorMessageFrom(error) ?? 'unknown error')
    }
    finally {
      setCapturing(false)
    }
  }

  const stopCapture = () => {
    stream?.getTracks().forEach(track => track.stop())
    setStream(null)
  }

  const startMonitoring = async () => {
    setMicError(null)
    setMicBusy(true)

    try {
      const next = await openMicrophone({
        deviceId: inputDevice || undefined,
        echoCancellation,
        noiseSuppression,
        autoGainControl,
      })
      const detector = createVoiceActivityDetector(next)
      const unsubscribe = detector.subscribe(setActivity)
      detector.start()
      monitorRef.current = { stream: next, detector, unsubscribe }
      setMonitoring(true)
    }
    catch (cause) {
      setMicError(errorMessageFrom(cause) ?? 'unknown error')
    }
    finally {
      setMicBusy(false)
    }
  }

  const inputs = devices.filter(device => device.kind === 'audioinput')
  const outputs = devices.filter(device => device.kind === 'audiooutput')
  const hasAudioTrack = Boolean(stream?.getAudioTracks().length)
  const level = activity ? Math.min(1, activity.level * 6) : 0

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.reactShell.desktopTitle', { defaultValue: 'Desktop' })}
        description={t('settings.reactShell.desktopDescription', {
          defaultValue: 'Window, power, screen, and audio controls for the desktop app.',
        })}
      />

      {!bridge && (
        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.reactShell.desktopBrowserHint', {
            defaultValue: 'These controls need the desktop app. This page runs in a browser tab now.',
          })}
        </p>
      )}

      <SectionCard
        title={t('settings.reactShell.windowTray', { defaultValue: 'Window and tray' })}
      >
        <ToggleField
          label={t('settings.reactShell.closeToTray', { defaultValue: 'Close to the tray' })}
          description={t('settings.reactShell.closeToTrayHint', {
            defaultValue: 'Closing the window keeps the pet running in the tray.',
          })}
          checked={closeToTray}
          onChange={next => void setTrayPreference(next)}
        />
        <p className="text-xs text-[var(--aipets-muted)]">
          {t('settings.reactShell.quitHint', { defaultValue: 'Use Quit in the tray menu to exit.' })}
        </p>
      </SectionCard>

      <SectionCard
        title={t('settings.reactShell.windowsTitle', { defaultValue: 'Windows' })}
        description={t('settings.reactShell.windowsHint', {
          defaultValue: 'The pet, the settings, and the widget are separate windows. Each one keeps its own position.',
        })}
      >
        {bridge && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => void applyWindows(() => bridge.openWindow('widget'))}
            >
              <span className="icon-[solar--widget-4-bold-duotone]" />
              {' '}
              {t('settings.reactShell.openWidgetWindow', { defaultValue: 'Open widget window' })}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => void applyWindows(() => bridge.openWindow('settings'))}
            >
              <span className="icon-[solar--settings-bold-duotone]" />
              {' '}
              {t('settings.reactShell.openSettingsWindow', { defaultValue: 'Open settings window' })}
            </button>
          </div>
        )}

        {windowError && <p className="text-xs text-rose-400">{windowError}</p>}

        {bridge && windows.filter(item => item.open).length > 0 && (
          <ul className="flex flex-col gap-2">
            {windows.filter(item => item.open).map(item => (
              <li
                key={item.kind}
                className="flex flex-wrap items-center gap-2 border border-[var(--aipets-border)] rounded-xl px-3 py-2 text-xs"
              >
                <span className="min-w-16 font-medium">{windowLabels[item.kind]}</span>
                <span className="text-[var(--aipets-muted)]">
                  {item.fullscreen
                    ? t('settings.reactShell.windowFullscreen', { defaultValue: 'fullscreen' })
                    : item.focused
                      ? t('settings.reactShell.windowFocused', { defaultValue: 'focused' })
                      : t('settings.reactShell.windowOpen', { defaultValue: 'open' })}
                </span>

                <label className="ml-auto flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={item.alwaysOnTop}
                    onChange={(event) => {
                      const value = event.target.checked
                      void applyWindows(async () => {
                        await bridge.setWindowAlwaysOnTop(item.kind, value)
                        return bridge.listWindows()
                      })
                    }}
                  />
                  {t('settings.reactShell.petAlwaysOnTop', { defaultValue: 'Always on top' })}
                </label>

                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => void applyWindows(async () => {
                    await bridge.focusWindow(item.kind)
                    return bridge.listWindows()
                  })}
                >
                  {t('settings.reactShell.focusWindow', { defaultValue: 'Focus' })}
                </button>

                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => void applyWindows(async () => {
                    await bridge.toggleWindowFullscreen(item.kind)
                    return bridge.listWindows()
                  })}
                >
                  {item.fullscreen
                    ? t('settings.reactShell.exitFullscreen', { defaultValue: 'Exit fullscreen' })
                    : t('settings.reactShell.toggleFullscreen', { defaultValue: 'Fullscreen' })}
                </button>

                {item.kind !== 'main' && (
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => void applyWindows(() => bridge.closeWindow(item.kind))}
                  >
                    {t('settings.reactShell.closeWindow', { defaultValue: 'Close' })}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={t('settings.reactShell.powerTitle', { defaultValue: 'Battery and power' })}>
        {battery && battery.supported
          ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{t('settings.reactShell.batteryLevel', { defaultValue: 'Battery level' })}</span>
                  <span className="font-semibold">
                    {Math.round(battery.level * 100)}
                    %
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--aipets-hover)]">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${Math.round(battery.level * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--aipets-muted)]">
                  {battery.charging
                    ? t('settings.reactShell.batteryCharging', { defaultValue: 'Charging' })
                    : t('settings.reactShell.batteryDischarging', { defaultValue: 'On battery' })}
                </p>
              </div>
            )
          : (
              <p className="text-xs text-[var(--aipets-muted)]">
                {battery
                  ? t('settings.reactShell.batteryUnsupported', { defaultValue: 'This browser cannot read the battery.' })
                  : ''}
              </p>
            )}

        {power && (
          <p className="text-xs text-[var(--aipets-muted)]">
            {t('settings.reactShell.acPower', { defaultValue: 'Power source' })}
            {': '}
            {power.onBatteryPower
              ? t('settings.reactShell.batteryDischarging', { defaultValue: 'On battery' })
              : t('settings.reactShell.acPowerLine', { defaultValue: 'AC power' })}
            {' · '}
            {t('settings.reactShell.idleState', { defaultValue: 'Idle state' })}
            {': '}
            {power.idleState}
            {' ('}
            {power.idleSeconds}
            s)
          </p>
        )}

        {lastPowerEvent && (
          <p className="text-xs text-[var(--aipets-muted)]">
            {t('settings.reactShell.lastPowerEvent', { defaultValue: 'Last power event' })}
            {': '}
            {lastPowerEvent.type}
            {' · '}
            {new Date(lastPowerEvent.at).toLocaleTimeString()}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title={t('settings.reactShell.screenTitle', { defaultValue: 'Screen capture' })}
        description={t('settings.reactShell.screenHint', {
          defaultValue: 'The capture takes the primary screen. On Windows the system audio comes with the video.',
        })}
      >
        {displays.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-[var(--aipets-muted)]">
            {displays.map(display => (
              <li key={display.id}>
                {display.label}
                {' · '}
                {display.bounds.width}
                x
                {display.bounds.height}
                {display.primary
                  ? ` · ${t('settings.reactShell.primaryDisplay', { defaultValue: 'Primary' })}`
                  : ''}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={capturing || Boolean(stream)}
            onClick={() => void startCapture()}
          >
            {t('settings.reactShell.startCapture', { defaultValue: 'Start capture' })}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!stream}
            onClick={stopCapture}
          >
            {t('settings.reactShell.stopCapture', { defaultValue: 'Stop capture' })}
          </button>
        </div>

        {stream && (
          <p className="text-xs text-[var(--aipets-muted)]">
            {hasAudioTrack
              ? t('settings.reactShell.captureWithAudio', { defaultValue: 'Screen and system audio are live.' })
              : t('settings.reactShell.captureWithoutAudio', { defaultValue: 'Screen is live without system audio.' })}
          </p>
        )}

        {captureError && (
          <p className="text-xs text-rose-400">
            {t('settings.reactShell.captureFailed', {
              defaultValue: 'Screen capture failed: {{message}}',
              message: captureError,
            })}
          </p>
        )}

        <video
          ref={videoRef}
          className="w-full border border-[var(--aipets-border)] rounded-xl"
          muted
          autoPlay
          playsInline
        />
      </SectionCard>

      <SectionCard
        title={t('settings.reactShell.audioTitle', { defaultValue: 'Audio devices' })}
        description={t('settings.reactShell.audioHint', {
          defaultValue: 'The microphone records speech. System audio arrives with a screen capture.',
        })}
      >
        <SelectField
          label={t('settings.reactShell.microphone', { defaultValue: 'Microphone' })}
          value={inputDevice}
          options={[
            { value: '', label: t('settings.reactShell.systemDefault', { defaultValue: 'System default' }) },
            ...inputs.map(device => ({
              value: device.deviceId,
              label: device.label || device.deviceId,
            })),
          ]}
          onChange={setInputDevice}
        />

        <SelectField
          label={t('settings.reactShell.speaker', { defaultValue: 'Speaker' })}
          value={outputDevice}
          options={[
            { value: '', label: t('settings.reactShell.systemDefault', { defaultValue: 'System default' }) },
            ...outputs.map(device => ({
              value: device.deviceId,
              label: device.label || device.deviceId,
            })),
          ]}
          onChange={setOutputDevice}
        />

        {devices.length === 0 && (
          <p className="text-xs text-[var(--aipets-muted)]">
            {t('settings.reactShell.noDevices', {
              defaultValue: 'No audio devices found. Allow microphone access to see device names.',
            })}
          </p>
        )}

        <button type="button" className={buttonClass} onClick={() => void refreshDevices()}>
          {t('settings.reactShell.refreshDevices', { defaultValue: 'Refresh devices' })}
        </button>
      </SectionCard>

      <SectionCard
        title={t('settings.reactShell.audioPipelineTitle', { defaultValue: 'Audio pipeline' })}
        description={t('settings.reactShell.audioPipelineHint', {
          defaultValue: 'Echo cancellation keeps the pet from hearing its own voice. The voice detector reports when you speak.',
        })}
      >
        <ToggleField
          label={t('settings.reactShell.echoCancellation', { defaultValue: 'Echo cancellation' })}
          description={t('settings.reactShell.echoCancellationHint', {
            defaultValue: 'Remove the speaker output from the microphone input.',
          })}
          checked={echoCancellation}
          onChange={setEchoCancellation}
        />
        <ToggleField
          label={t('settings.reactShell.noiseSuppression', { defaultValue: 'Noise suppression' })}
          checked={noiseSuppression}
          onChange={setNoiseSuppression}
        />
        <ToggleField
          label={t('settings.reactShell.autoGainControl', { defaultValue: 'Automatic gain' })}
          checked={autoGainControl}
          onChange={setAutoGainControl}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={micBusy || monitoring}
            onClick={() => void startMonitoring()}
          >
            {t('settings.reactShell.monitorMic', { defaultValue: 'Start voice monitor' })}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!monitoring}
            onClick={stopMonitoring}
          >
            {t('settings.reactShell.stopMonitor', { defaultValue: 'Stop monitor' })}
          </button>
        </div>

        {monitoring && (
          <div className="flex flex-col gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--aipets-hover)]">
              <div
                className="h-full rounded-full bg-sky-400 transition-[width] duration-100"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--aipets-muted)]">
              {activity?.speaking
                ? t('settings.reactShell.voiceDetected', { defaultValue: 'Voice detected' })
                : t('settings.reactShell.voiceSilent', { defaultValue: 'Silence' })}
            </p>
          </div>
        )}

        {micError && (
          <p className="text-xs text-rose-400">
            {t('settings.reactShell.microphoneFailed', {
              defaultValue: 'Microphone failed: {{message}}',
              message: micError,
            })}
          </p>
        )}
      </SectionCard>
    </section>
  )
}
