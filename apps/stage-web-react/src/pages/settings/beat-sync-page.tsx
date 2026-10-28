import type { BeatSyncParameters, BeatSyncSpectrumScale } from '../../audio/beat-sync'

import { useTranslation } from 'react-i18next'

import {
  beatSyncParametersKey,
  beatSyncSpectrumScaleKey,
  defaultBeatSyncParameters,
} from '../../audio/beat-sync'
import { PageHeader, SectionCard, SelectField, SliderField, ToggleField } from '../../components/fields'
import { useStoredValue } from '../../settings/persisted'

export function BeatSyncPage() {
  const { t } = useTranslation()
  const [parameters, setParameters] = useStoredValue<BeatSyncParameters>(
    beatSyncParametersKey,
    defaultBeatSyncParameters,
  )
  const [spectrumScale, setSpectrumScale] = useStoredValue<BeatSyncSpectrumScale>(
    beatSyncSpectrumScaleKey,
    'logarithm',
  )

  const patch = (next: Partial<BeatSyncParameters>) => {
    setParameters({ ...defaultBeatSyncParameters, ...parameters, ...next })
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
          defaultValue: 'The stage runs this detector on a microphone or a local audio file. Start it from the stage page.',
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
          onChange={value => setSpectrumScale(value === 'linear' ? 'linear' : 'logarithm')}
        />
      </SectionCard>
    </section>
  )
}
