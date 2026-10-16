'use client';

import React, { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import type { CardOrientation, CardPresetId } from './idCardTemplate';
import { CARD_PRESETS } from './idCardTemplate';
import type { CustomCardTemplate } from './cardTemplate';
import { safeImageSrc } from './printWindow';

export type DesignKey = `preset:${CardPresetId}` | `custom:${string}`;

interface CardDesignPickerProps {
  value: DesignKey;
  accent: string;
  templates: CustomCardTemplate[];
  defaultKey?: string;
  loading: boolean;
  onChange: (key: DesignKey) => void;
  onCreate: (orientation: CardOrientation) => void;
}

const tileBase =
  'group flex w-[86px] shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-[9px] border bg-white p-1.5 text-center transition-[border-color,box-shadow,background-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d628e]';

function tileClass(active: boolean) {
  return `${tileBase} ${
    active
      ? 'border-[#2d628e] bg-[#f8fbfe] shadow-[0_9px_22px_rgba(26,58,84,0.09)]'
      : 'border-[#dce2e5] hover:border-[#9fb3c3]'
  }`;
}

export function CardDesignPicker({ value, accent, templates, defaultKey, loading, onChange, onCreate }: CardDesignPickerProps) {
  const labelId = useId();
  const [choosing, setChoosing] = useState(false);

  return (
    <div className="flex basis-full flex-col gap-1.5">
      <span id={labelId} className="text-[12px] font-[650] text-[#33435a]">
        Design
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex gap-2 overflow-x-auto pb-1">
        {CARD_PRESETS.map((preset) => {
          const key: DesignKey = `preset:${preset.id}`;
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              title={preset.description}
              onClick={() => onChange(key)}
              className={tileClass(active)}
            >
              <PresetThumb id={preset.id} accent={accent} />
              <TileLabel text={preset.name} isDefault={defaultKey === key} />
            </button>
          );
        })}

        {templates.map((template) => {
          const key: DesignKey = `custom:${template.id}`;
          const active = value === key;
          const src = safeImageSrc(template.front.background);
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              title={template.name}
              onClick={() => onChange(key)}
              className={tileClass(active)}
            >
              <span className="flex h-[46px] w-[72px] items-center justify-center">
                <span
                  className="block overflow-hidden rounded-[3px] border border-[#dce2e5] bg-[#f6f5f1]"
                  style={template.orientation === 'portrait' ? { width: 29, height: 46 } : { width: 72, height: 46 }}
                >
                  {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : null}
                </span>
              </span>
              <TileLabel text={template.name} isDefault={defaultKey === key} />
            </button>
          );
        })}

        {choosing ? (
          <div className="flex w-[86px] shrink-0 flex-col justify-center gap-1 rounded-[9px] border border-dashed border-[#9fb3c3] bg-white p-1.5">
            {(['landscape', 'portrait'] as const).map((orientation) => (
              <button
                key={orientation}
                type="button"
                onClick={() => {
                  setChoosing(false);
                  onCreate(orientation);
                }}
                className="h-7 cursor-pointer rounded-[6px] text-[12px] font-[650] text-[#17324e] hover:bg-[#f1f4f6] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2d628e]"
              >
                {orientation === 'landscape' ? 'Landscape' : 'Portrait'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setChoosing(false)}
              className="h-6 cursor-pointer text-[11.5px] font-[600] text-[#687789] hover:text-[#172234]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setChoosing(true)}
            className={`${tileBase} border-dashed border-[#9fb3c3] hover:border-[#2d628e] hover:bg-[#f8fbfe]`}
          >
            <span className="flex h-[46px] w-[72px] items-center justify-center text-[#2d628e]">
              <Plus className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-[11.5px] leading-tight font-[650] text-[#17324e]">Upload your own</span>
          </button>
        )}
        {loading ? <span className="self-center pl-1 text-[12px] text-[#687789]">Loading saved designs</span> : null}
      </div>
    </div>
  );
}

function TileLabel({ text, isDefault }: { text: string; isDefault: boolean }) {
  return (
    <span className="flex w-full flex-col items-center">
      <span className="w-full truncate text-[11.5px] leading-tight font-[650] text-[#172234]">{text}</span>
      {isDefault ? <span className="text-[10.5px] leading-tight font-[600] text-[#3f7259]">Default</span> : null}
    </span>
  );
}

/** Small schematic of each built-in design, drawn with the current accent. */
function PresetThumb({ id, accent }: { id: CardPresetId; accent: string }) {
  const line = (top: number, left: number, width: number, color = '#cfd8df', height = 3) => (
    <span className="absolute rounded-full" style={{ top, left, width, height, background: color }} />
  );
  const photo = (top: number, left: number, w: number, h: number, extra: React.CSSProperties = {}) => (
    <span className="absolute rounded-[2px] bg-[#c3ced6]" style={{ top, left, width: w, height: h, ...extra }} />
  );

  let content: React.ReactNode;
  let background = '#ffffff';
  switch (id) {
    case 'minimal':
      content = (
        <>
          <span className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ background: accent }} />
          {line(6, 8, 22, accent)}
          {line(15, 8, 34, '#172234', 4)}
          {line(22, 8, 22)}
          {line(34, 8, 26)}
          {photo(12, 50, 15, 19)}
        </>
      );
      break;
    case 'split':
      content = (
        <>
          <span className="absolute top-0 bottom-0 left-0 w-[24px]" style={{ background: accent }} />
          {photo(10, 4, 16, 20, { border: '1.5px solid #ffffff' })}
          {line(7, 30, 18, accent)}
          {line(15, 30, 34, '#172234', 4)}
          {line(22, 30, 22)}
          {line(34, 30, 28)}
        </>
      );
      break;
    case 'diagonal':
      content = (
        <>
          <span className="absolute top-0 right-0 left-0 h-[26px]" style={{ background: accent, clipPath: 'polygon(0 0,100% 0,100% 55%,0 100%)' }} />
          {photo(10, 28, 16, 16, { borderRadius: '50%', border: '1.5px solid #ffffff' })}
          {line(30, 18, 36, '#172234', 4)}
          {line(37, 24, 24)}
        </>
      );
      break;
    case 'dark':
      background = '#111c2a';
      content = (
        <>
          <span className="absolute top-0 right-0 left-0 h-[11px]" style={{ background: accent, opacity: 0.75 }} />
          {photo(15, 5, 16, 20, { background: '#2a3a4f' })}
          {line(17, 26, 32, '#f3f6f9', 4)}
          {line(24, 26, 22, '#5d6f83')}
          {line(34, 26, 18, '#5d6f83')}
        </>
      );
      break;
    default:
      content = (
        <>
          <span className="absolute top-0 right-0 left-0 h-[11px]" style={{ background: accent }} />
          {photo(15, 5, 16, 20)}
          {line(17, 26, 32, '#172234', 4)}
          {line(24, 26, 22)}
          {line(34, 26, 18)}
          <span className="absolute right-0 bottom-0 left-0 h-[2px]" style={{ background: accent }} />
        </>
      );
  }

  return (
    <span
      aria-hidden
      className="relative block h-[46px] w-[72px] overflow-hidden rounded-[4px] border border-[#dce2e5]"
      style={{ background }}
    >
      {content}
    </span>
  );
}
