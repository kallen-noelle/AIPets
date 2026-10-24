import type { ReactNode } from 'react'

const fieldClass = [
  'w-full rounded-xl border border-[var(--airi-border)] bg-transparent px-3 py-2 text-sm',
  'outline-none focus:border-[var(--airi-fg)]',
].join(' ')

export function PageHeader({ title, description }: { title: string, description?: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="text-sm text-[var(--airi-muted)]">{description}</p>}
    </header>
  )
}

export function SectionCard({ title, description, children }: {
  title?: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border border-[var(--airi-border)] rounded-2xl bg-[var(--airi-card)] p-4">
      {(title || description) && (
        <div>
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {description && <p className="text-xs text-[var(--airi-muted)]">{description}</p>}
        </div>
      )}

      {children}
    </div>
  )
}

export function TextField({ label, description, value, onChange, placeholder, type = 'text' }: {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <input
        className={fieldClass}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
      {description && <span className="text-xs text-[var(--airi-muted)]">{description}</span>}
    </label>
  )
}

export function ToggleField({ label, description, checked, onChange }: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start justify-between gap-4 text-sm">
      <span className="flex flex-col gap-1">
        <span>{label}</span>
        {description && <span className="text-xs text-[var(--airi-muted)]">{description}</span>}
      </span>
      <input
        type="checkbox"
        className="mt-1 shrink-0"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
    </label>
  )
}

export function SelectField({ label, description, value, options, onChange }: {
  label: string
  description?: string
  value: string
  options: { value: string, label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <select className={fieldClass} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {description && <span className="text-xs text-[var(--airi-muted)]">{description}</span>}
    </label>
  )
}

export function SliderField({ label, description, value, min, max, step, onChange }: {
  label: string
  description?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="text-xs text-[var(--airi-muted)]">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
      {description && <span className="text-xs text-[var(--airi-muted)]">{description}</span>}
    </label>
  )
}
