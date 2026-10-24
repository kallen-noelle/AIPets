import { useTranslation } from 'react-i18next'

import { PageHeader, SectionCard, SelectField, SliderField, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

interface AnalyserParameters {
  minBeatInterval: number
  sensitivity: number
  lowpassFilterFrequency: number
  highpassFilterFrequency: number
  envelopeFilterFrequency: number
  warmup: boolean
  bufferDuration: number
  adaptiveThreshold: boolean
  spectralFlux: boolean
}

const parametersKey = 'settings/beat-sync/parameters'
const spectrumScaleKey = 'settings/beat-sync/spectrum-scale'

const defaultParameters: AnalyserParameters = {
  minBeatInterval: 0.2,
  sensitivity: 0.7,
  lowpassFilterFrequency: 200,
  highpassFilterFrequency: 30,
  envelopeFilterFrequency: 12,
  warmup: false,
  bufferDuration: 4,
  adaptiveThreshold: false,
  spectralFlux: false,
}

export function BeatSyncPage() {
  const { t } = useTranslation()
  const [parameters, setParameters] = useStoredValue<AnalyserParameters>(parametersKey, defaultParameters)
  const [spectrumScale, setSpectrumScale] = useStoredValue(spectrumScaleKey, 'logarithm')

  const patch = (next: Partial<AnalyserParameters>) => {
    setParameters({ ...defaultParameters, ...parameters, ...next })
  }

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        title={t('settings.pages.modules.beat_sync.title', { defaultValue: 'Beat Sync' })}
        description={t('settings.pages.modules.beat_sync.description', { defaultValue: '' })}
      />

      <SectionCard
        title={t('settings.reactShell.beatSyncParameters', { defaultValue: 'Detection parameters' })}
        description={t('settings.reactShell.beatSyncNote', {
          defaultValue: 'Beat Sync visualizes audio. The React stage does not run it yet.',
        })}
      >
        <SliderField
          label={t('settings.reactShell.beatSyncSensitivity', { defaultValue: 'Sensitivity' })}
          value={parameters.sensitivity}
          min={0}
          max={1}
          step={0.05}
          onChange={value => patch({ sensitivity: value })}
        />

        <SliderField
          label={t('settings.reactShell.beatSyncMinInterval', { defaultValue: 'Minimum beat interval (s)' })}
          value={parameters.minBeatInterval}
          min={0.05}
          max={1}
          step={0.05}
          onChange={value => patch({ minBeatInterval: value })}
        />

        <SliderField
          label={t('settings.reactShell.beatSyncBuffer', { defaultValue: 'Buffer duration (s)' })}
          value={parameters.bufferDuration}
          min={1}
          max={8}
          step={0.5}
          onChange={value => patch({ bufferDuration: value })}
        />

        <SliderField
          label={t('settings.reactShell.beatSyncLowpass', { defaultValue: 'Lowpass filter (Hz)' })}
          value={parameters.lowpassFilterFrequency}
          min={50}
          max={500}
          step={10}
          onChange={value => patch({ lowpassFilterFrequency: value })}
        />

        <SliderField
          label={t('settings.reactShell.beatSyncHighpass', { defaultValue: 'Highpass filter (Hz)' })}
          value={parameters.highpassFilterFrequency}
          min={10}
          max={200}
          step={5}
          onChange={value => patch({ highpassFilterFrequency: value })}
        />

        <SliderField
          label={t('settings.reactShell.beatSyncEnvelope', { defaultValue: 'Envelope filter (Hz)' })}
          value={parameters.envelopeFilterFrequency}
          min={1}
          max={30}
          step={1}
          onChange={value => patch({ envelopeFilterFrequency: value })}
        />

        <ToggleField
          label={t('settings.reactShell.beatSyncAdaptive', { defaultValue: 'Adaptive threshold' })}
          checked={parameters.adaptiveThreshold}
          onChange={value => patch({ adaptiveThreshold: value })}
        />

        <ToggleField
          label={t('settings.reactShell.beatSyncSpectralFlux', { defaultValue: 'Spectral flux' })}
          checked={parameters.spectralFlux}
          onChange={value => patch({ spectralFlux: value })}
        />

        <ToggleField
          label={t('settings.reactShell.beatSyncWarmup', { defaultValue: 'Warmup' })}
          checked={parameters.warmup}
          onChange={value => patch({ warmup: value })}
        />

        <SelectField
          label={t('settings.reactShell.beatSyncSpectrum', { defaultValue: 'Spectrum scale' })}
          value={spectrumScale}
          options={[
            { value: 'logarithm', label: t('settings.reactShell.beatSyncLogarithm', { defaultValue: 'Logarithmic' }) },
            { value: 'linear', label: t('settings.reactShell.beatSyncLinear', { defaultValue: 'Linear' }) },
          ]}
          onChange={setSpectrumScale}
        />
      </SectionCard>
    </section>
  )
}
