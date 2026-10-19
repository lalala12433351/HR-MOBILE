'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ImagePlus, Loader2, Printer, Trash2, TriangleAlert, X } from 'lucide-react';
import { buildPrintHtml, waitForDocumentAssets } from './printWindow';

export type FitState = 'truncated' | 'hidden';
export type FitReport = Record<string, FitState>;

/**
 * Templates mark measurable text with `data-fit-id`. An element is `hidden` when it falls outside its
 * nearest `data-fit-box`, and `truncated` when its `data-fit-text` node is clamped or ellipsised.
 */
export function measureFit(doc: Document): FitReport {
  const report: FitReport = {};
  doc.querySelectorAll<HTMLElement>('[data-fit-id]').forEach((el) => {
    const id = el.dataset.fitId;
    if (!id) return;
    const box = el.closest<HTMLElement>('[data-fit-box]');
    if (box && box !== el) {
      const boxRect = box.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      if (rect.bottom > boxRect.bottom + 0.5 || rect.right > boxRect.right + 0.5) {
        report[id] = 'hidden';
        return;
      }
    }
    const text = el.hasAttribute('data-fit-text') ? el : el.querySelector<HTMLElement>('[data-fit-text]');
    if (text && (text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1)) {
      report[id] = 'truncated';
    }
  });
  return report;
}

const PREVIEW_OVERRIDES = `
  html, body { background: transparent !important; overflow: hidden; }
  body { display: inline-block; }
`;

interface PreviewFrameProps<T> {
  title: string;
  styles: string;
  body: string;
  /** Largest zoom applied when the stage has spare room (1 = true print size at 96dpi). */
  maxScale?: number;
  measure: (doc: Document) => T;
  onMeasure: (result: T) => void;
}

export function PreviewFrame<T>({ title, styles, body, maxScale = 1, measure, onMeasure }: PreviewFrameProps<T>) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const versionRef = useRef(0);
  const measureRef = useRef(measure);
  const onMeasureRef = useRef(onMeasure);
  const [loaded, setLoaded] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [available, setAvailable] = useState(0);
  const [shell] = useState(() => buildPrintHtml({ title, styles: '', body: '' }));

  useLayoutEffect(() => {
    measureRef.current = measure;
    onMeasureRef.current = onMeasure;
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    const version = ++versionRef.current;

    let style = doc.getElementById('tpl') as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = 'tpl';
      doc.head.appendChild(style);
    }
    style.textContent = `${styles}${PREVIEW_OVERRIDES}`;
    doc.body.innerHTML = body;

    const settle = () => {
      if (version !== versionRef.current) return;
      const rect = doc.body.getBoundingClientRect();
      setSize({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
      onMeasureRef.current(measureRef.current(doc));
    };
    settle();
    void waitForDocumentAssets(doc, 2000).then(settle);
  }, [loaded, styles, body]);

  const scale = size.width && available ? Math.min(maxScale, available / size.width) : 1;

  return (
    <div ref={stageRef} className="w-full">
      <div
        className="relative mx-auto"
        style={{ width: size.width * scale || '100%', height: size.height * scale || 320 }}
      >
        {!size.width ? (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[#687789]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Preparing preview
          </div>
        ) : null}
        <iframe
          ref={frameRef}
          title={`${title} preview`}
          srcDoc={shell}
          onLoad={() => setLoaded(true)}
          tabIndex={-1}
          className="absolute left-0 top-0 border-0"
          style={{
            width: size.width || 1200,
            height: size.height || 900,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            opacity: size.width ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}

interface StudioShellProps {
  title: string;
  description: string;
  onClose: () => void;
  editor: React.ReactNode;
  toolbar: React.ReactNode;
  preview: React.ReactNode;
  status: React.ReactNode;
  actions: React.ReactNode;
}

export function StudioShell({ title, description, onClose, editor, toolbar, preview, status, actions }: StudioShellProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit');

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0f1b2a]/45 p-0 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex h-[100dvh] w-full max-w-[1320px] flex-col overflow-hidden bg-white text-[#172234] outline-none sm:h-[min(94dvh,940px)] sm:rounded-[12px] sm:shadow-[0_28px_70px_-24px_rgba(15,27,42,0.5)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#dce2e5] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-[750] leading-tight tracking-[-0.02em]">
              {title}
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-[#5e6c7b]">{description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="lg:hidden">
              <Segmented<'edit' | 'preview'>
                label="Pane"
                hideLabel
                value={mobilePane}
                onChange={setMobilePane}
                options={[
                  { value: 'edit', label: 'Edit' },
                  { value: 'preview', label: 'Preview' },
                ]}
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[7px] text-[#5e6c7b] transition-colors hover:bg-[#eef2f4] hover:text-[#172234] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d628e]"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(340px,410px)_minmax(0,1fr)]">
          <aside
            className={`${mobilePane === 'edit' ? 'flex' : 'hidden'} min-h-0 flex-col overflow-y-auto border-[#dce2e5] lg:flex lg:border-r`}
          >
            <div className="divide-y divide-[#e6ebee]">{editor}</div>
          </aside>
          <section
            aria-label="Print preview"
            className={`${mobilePane === 'preview' ? 'flex' : 'hidden'} min-h-0 flex-col bg-[#f6f5f1] lg:flex`}
          >
            <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-[#e3e1da] px-5 py-3">{toolbar}</div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-8 sm:py-8">{preview}</div>
          </section>
        </div>

        <footer className="flex flex-col gap-3 border-t border-[#dce2e5] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[13px]">{status}</div>
          <div className="flex shrink-0 items-center justify-end gap-2">{actions}</div>
        </footer>
      </div>
    </div>
  );
}

export function StudioSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-5">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-[720] tracking-[-0.01em] text-[#172234]">{title}</h3>
          {description ? <p className="mt-0.5 text-[12.5px] leading-snug text-[#687789]">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export const inputClass =
  'h-10 w-full min-w-0 rounded-[7px] border border-[#cad5dc] bg-white px-3 text-[13.5px] text-[#172234] placeholder:text-[#8a97a6] transition-[border-color,box-shadow] outline-none focus:border-[#2d628e] focus:ring-[3px] focus:ring-[#d8e8f2]';

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  mono,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[12px] font-[650] text-[#33435a]">
        {label}
      </label>
      <input
        id={id}
        className={`${inputClass} ${mono ? 'font-mono text-[13px]' : ''}`}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <div className="text-[12px] leading-snug">{hint}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className={hideLabel ? 'sr-only' : 'text-[12px] font-[650] text-[#33435a]'}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="inline-flex rounded-[8px] border border-[#cad5dc] bg-white p-0.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={`h-8 cursor-pointer rounded-[6px] px-3 text-[12.5px] font-[650] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2d628e] ${
                active ? 'bg-[#17324e] text-white' : 'text-[#5e6c7b] hover:bg-[#f1f4f6] hover:text-[#172234]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const ACCENTS = [
  { value: '#17324e', label: 'Navy' },
  { value: '#1d5f8a', label: 'Ocean' },
  { value: '#2f5d46', label: 'Forest' },
  { value: '#3a3f4b', label: 'Graphite' },
  { value: '#7a2e35', label: 'Maroon' },
];

const ACCENT_HEX = /^#[0-9a-f]{6}$/i;

export function AccentPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const labelId = useId();
  const customId = useId();
  const safe = ACCENT_HEX.test(value) ? value : '#17324e';
  const presetActive = ACCENTS.some((accent) => accent.value === safe);

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[12px] font-[650] text-[#33435a]">
        Accent
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex h-9 flex-wrap items-center gap-1.5">
        {ACCENTS.map((accent) => {
          const active = accent.value === safe;
          return (
            <button
              key={accent.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={accent.label}
              title={accent.label}
              onClick={() => onChange(accent.value)}
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d628e] ${
                active ? 'border-[#172234]' : 'border-transparent hover:scale-105'
              }`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: accent.value }}>
                {active ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
              </span>
            </button>
          );
        })}
        <label
          htmlFor={customId}
          title="Custom colour"
          className={`relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 transition-transform active:scale-95 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#2d628e] ${
            !presetActive ? 'border-[#172234]' : 'border-transparent hover:scale-105'
          }`}
        >
          <span
            className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full"
            style={{
              background: presetActive
                ? 'conic-gradient(#e85d4c, #f0c419, #4caf73, #3b82f6, #a855f7, #e85d4c)'
                : safe,
            }}
          >
            {!presetActive ? <Check className="h-3 w-3 text-white drop-shadow" strokeWidth={3} /> : null}
          </span>
          <input
            id={customId}
            type="color"
            role="radio"
            aria-checked={!presetActive}
            aria-label="Custom accent colour"
            value={safe}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

export function FitBadge({ state }: { state?: FitState }) {
  if (!state) return null;
  return state === 'hidden' ? (
    <span className="inline-flex items-center rounded-[5px] bg-[#faeeee] px-1.5 py-0.5 text-[11px] font-[650] text-[#8b3133]">
      Not printed
    </span>
  ) : (
    <span className="inline-flex items-center rounded-[5px] bg-[#e7eef0] px-1.5 py-0.5 text-[11px] font-[650] text-[#33435a]">
      Shortened
    </span>
  );
}

const iconButton =
  'flex h-10 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-[#687789] transition-colors hover:bg-[#eef2f4] hover:text-[#172234] disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2d628e]';

export function RowControls({
  label,
  onUp,
  onDown,
  onRemove,
}: {
  label: string;
  onUp?: () => void;
  onDown?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" className={iconButton} onClick={onUp} disabled={!onUp} aria-label={`Move ${label} up`}>
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={iconButton} onClick={onDown} disabled={!onDown} aria-label={`Move ${label} down`}>
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`${iconButton} hover:bg-[#faeeee] hover:text-[#8b3133]`}
        onClick={onRemove}
        aria-label={`Remove ${label}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function moveItem<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function AddRowButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-[7px] border border-[#cad5dc] bg-white px-2.5 text-[12.5px] font-[650] text-[#17324e] transition-colors hover:border-[#2d628e] hover:bg-[#f8fbfe] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2d628e]"
    >
      {children}
    </button>
  );
}

export function ImagePicker({
  label,
  src,
  description,
  onPick,
  onClear,
  aspect = 'square',
}: {
  label: string;
  src: string;
  description: string;
  onPick: (file: File) => void;
  onClear: () => void;
  aspect?: 'square' | 'portrait' | 'wide';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const box = aspect === 'portrait' ? 'h-[60px] w-12' : aspect === 'wide' ? 'h-10 w-20' : 'h-12 w-12';
  return (
    <div className="flex items-center gap-3">
      <div className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-[#dce2e5] bg-[#f6f5f1]`}>
        {src ? <img src={src} alt="" className="h-full w-full object-contain" /> : <ImagePlus className="h-4 w-4 text-[#8a97a6]" aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-[650] text-[#33435a]">{label}</p>
        <p className="text-[12px] leading-snug text-[#687789]">{description}</p>
        <div className="mt-1 flex gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onPick(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer text-[12.5px] font-[650] text-[#2d628e] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d628e]"
          >
            {src ? 'Replace' : 'Upload'}
          </button>
          {src ? (
            <button
              type="button"
              onClick={onClear}
              className="cursor-pointer text-[12.5px] font-[650] text-[#5e6c7b] hover:text-[#8b3133] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d628e]"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function FitStatus({ issues, okText }: { issues: string[]; okText: string }) {
  if (issues.length === 0) {
    return (
      <p className="flex items-center gap-1.5 font-[600] text-[#3f7259]">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        {okText}
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 font-[600] text-[#8b3133]" role="status">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{issues.join(' ')}</span>
    </p>
  );
}

export function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 cursor-pointer items-center justify-center rounded-[7px] border border-[#cad5dc] bg-white px-4 text-[13.5px] font-[650] text-[#17324e] transition-colors hover:border-[#17324e] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d628e]"
    >
      {children}
    </button>
  );
}

export function PrintButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[7px] bg-[#17324e] px-4 text-[13.5px] font-[650] whitespace-nowrap text-white transition-colors hover:bg-[#285275] active:translate-y-px disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d628e]"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Printer className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
}

export function useFitReport() {
  const [report, setReport] = useState<FitReport>({});
  const update = useCallback((next: FitReport) => {
    setReport((current) => {
      const a = Object.entries(current).sort().join('|');
      const b = Object.entries(next).sort().join('|');
      return a === b ? current : next;
    });
  }, []);
  return [report, update] as const;
}
