import React, { useEffect, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import { ColorPicker } from '../../../ui/ColorPicker';
import { cn } from '../../../../utils/cn';
import type { Align } from '../types.ts';
import { useBuilder } from '../builderContext.ts';

export const INPUT_CLASS =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-ui text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50';

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => (
  <label className={cn('block', className)}>
    <span className="mb-1 block type-label text-slate-600">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-caption text-slate-400">{hint}</span>}
  </label>
);

/** A labelled group that is not one single input (several controls, no <label> wrapper). */
export const Group: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={cn('block', className)}>
    <span className="mb-1 block type-label text-slate-600">{label}</span>
    {children}
  </div>
);

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="mt-1 type-overline text-slate-400">{children}</h4>
);

export const TextField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: string;
  ariaLabel?: string;
}> = ({ value, onChange, placeholder, mono, multiline, rows = 6, type = 'text', ariaLabel }) =>
  multiline ? (
    <textarea
      value={value}
      rows={rows}
      aria-label={ariaLabel}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      className={cn(INPUT_CLASS, 'resize-y', mono && 'font-mono')}
    />
  ) : (
    <input
      type={type}
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(INPUT_CLASS, mono && 'font-mono')}
    />
  );

/** A number input that may be empty while typing; commits clamped numbers as they become valid. */
export const NumberField: React.FC<{
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  ariaLabel?: string;
}> = ({ value, onChange, min, max, step = 1, suffix, ariaLabel }) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="number"
        inputMode="numeric"
        value={text}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(Math.min(Math.max(n, min), max));
        }}
        onBlur={() => setText(String(value))}
        className={INPUT_CLASS}
      />
      {suffix && <span className="text-caption text-slate-400">{suffix}</span>}
    </span>
  );
};

export const SelectField: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
}> = ({ value, onChange, options, ariaLabel }) => (
  <select value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

export const Segmented = <T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  ariaLabel?: string;
}) => (
  <div role="group" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-lg border border-slate-200">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        title={o.title}
        aria-label={o.title}
        aria-pressed={o.value === value}
        onClick={() => onChange(o.value)}
        className={cn(
          'cursor-pointer px-2.5 py-1.5 text-ui font-semibold transition-colors',
          o.value === value ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50',
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const AlignField: React.FC<{ value: Align | undefined; onChange: (a: Align) => void; fallback?: Align }> = ({ value, onChange, fallback = 'left' }) => {
  const { t } = useBuilder();
  return (
    <Segmented<Align>
      value={value ?? fallback}
      onChange={onChange}
      ariaLabel={t('Alignment', 'Zarovnanie', 'Igazítás')}
      options={[
        { value: 'left', label: <AlignLeft className="h-3.5 w-3.5" />, title: t('Left', 'Vľavo', 'Balra') },
        { value: 'center', label: <AlignCenter className="h-3.5 w-3.5" />, title: t('Center', 'Na stred', 'Középre') },
        { value: 'right', label: <AlignRight className="h-3.5 w-3.5" />, title: t('Right', 'Vpravo', 'Jobbra') },
      ]}
    />
  );
};

/** A colour with an optional "use the default" reset. `value` undefined shows `fallback`. */
export const ColorField: React.FC<{
  value: string | undefined;
  fallback: string;
  onChange: (hex: string | undefined) => void;
  resettable?: boolean;
}> = ({ value, fallback, onChange, resettable = true }) => {
  const { t } = useBuilder();
  return (
    <span className="flex items-center gap-2">
      <ColorPicker value={value} fallback={fallback} variant="field" onChange={(hex) => onChange(hex)} />
      <span className="font-mono text-caption text-slate-500">{(value || fallback).toLowerCase()}</span>
      {resettable && value !== undefined && (
        <button type="button" onClick={() => onChange(undefined)} className="cursor-pointer text-caption font-semibold text-indigo-600 hover:underline">
          {t('Default', 'Predvolená', 'Alapértelmezett')}
        </button>
      )}
    </span>
  );
};

export const ToggleField: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex cursor-pointer items-center gap-2 text-ui text-slate-700">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
    {label}
  </label>
);
