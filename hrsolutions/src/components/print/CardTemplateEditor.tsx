'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, Copy, Loader2, Pipette, Plus, Trash2 } from 'lucide-react';
import { compressAvatarImage } from '@/utils/imageUtils';
import type { IdCardDraft } from './idCardTemplate';
import {
  ARTWORK_PX,
  BINDING_LABELS,
  CARD_MM,
  CardBinding,
  CardElement,
  CardSide,
  CustomCardTemplate,
  bindingLabel,
  createElement,
  elementContent,
  isImageBinding,
  starterElements,
} from './cardTemplate';
import { newPrintId } from './printWindow';
import {
  AddRowButton,
  ImagePicker,
  SecondaryButton,
  Segmented,
  StudioSection,
  StudioShell,
  TextField,
  inputClass,
} from './PrintStudioShell';

const MM_PX = 96 / 25.4;
const SNAP = 0.5;
const MIN_SIZE = 2;
const HEX = /^#[0-9a-f]{6}$/i;

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

const snap = (value: number) => Math.round(value / SNAP) * SNAP;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const tidy = (value: number) => Math.round(value * 100) / 100;

const BASE_BINDINGS: CardBinding[] = [
  'photo',
  'name',
  'roleLine',
  'personId',
  'bloodGroup',
  'logo',
  'orgName',
  'validThrough',
  'returnAddress',
  'signature',
  'signatoryLabel',
  'idCaption',
];

interface CardTemplateEditorProps {
  template: CustomCardTemplate;
  draft: IdCardDraft;
  isNew: boolean;
  saving: boolean;
  error: string;
  onSave: (template: CustomCardTemplate) => void;
  onCancel: () => void;
}

export function CardTemplateEditor({ template, draft, isNew, saving, error, onSave, onCancel }: CardTemplateEditorProps) {
  const [tpl, setTpl] = useState<CustomCardTemplate>(template);
  const [side, setSide] = useState<CardSide>('front');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [artworkNotes, setArtworkNotes] = useState<Record<CardSide, string>>({ front: '', back: '' });
  const [nameError, setNameError] = useState('');

  const face = tpl[side];
  const selected = face.elements.find((item) => item.id === selectedId) || null;
  const card = CARD_MM[tpl.orientation];
  const artwork = ARTWORK_PX[tpl.orientation];

  const fieldBindings = useMemo(() => {
    const labels = draft.fields.map((item) => item.label.trim()).filter(Boolean);
    return Array.from(new Set(labels)).map((label) => `field:${label}` as CardBinding);
  }, [draft.fields]);

  const setElements = (updater: (elements: CardElement[]) => CardElement[]) =>
    setTpl((current) => ({ ...current, [side]: { ...current[side], elements: updater(current[side].elements) } }));

  const updateElement = (id: string, patch: Partial<CardElement>) =>
    setElements((elements) => elements.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const removeElement = (id: string) => {
    setElements((elements) => elements.filter((item) => item.id !== id));
    setSelectedId(null);
  };

  const addElement = (bind: CardBinding) => {
    const created = createElement(bind, tpl.orientation);
    setElements((elements) => [...elements, created]);
    setSelectedId(created.id);
  };

  const duplicateElement = (item: CardElement) => {
    const copy = {
      ...item,
      id: newPrintId('el'),
      x: clamp(item.x + 2, 0, card.w - item.w),
      y: clamp(item.y + 2, 0, card.h - item.h),
    };
    setElements((elements) => [...elements, copy]);
    setSelectedId(copy.id);
  };

  const reorder = (id: string, toFront: boolean) =>
    setElements((elements) => {
      const item = elements.find((row) => row.id === id);
      if (!item) return elements;
      const rest = elements.filter((row) => row.id !== id);
      return toFront ? [...rest, item] : [item, ...rest];
    });

  const switchSide = (next: CardSide) => {
    setSide(next);
    setSelectedId(null);
  };

  const pickArtwork = async (file: File) => {
    const dataUrl = await compressAvatarImage(file, Math.max(artwork.w, artwork.h), Math.max(artwork.w, artwork.h), 0.9);
    if (!dataUrl) return;
    setTpl((current) => ({ ...current, [side]: { ...current[side], background: dataUrl } }));
    const size = await imageSize(dataUrl);
    setArtworkNotes((current) => ({ ...current, [side]: size ? artworkNote(size, artwork) : '' }));
  };

  const save = () => {
    const name = tpl.name.trim();
    if (!name) {
      setNameError('Give the design a name so you can find it later.');
      return;
    }
    setNameError('');
    onSave({ ...tpl, name });
  };

  const sideLabel = side === 'front' ? 'front' : 'back';

  const editor = (
    <>
      <StudioSection title="Design" description={`${tpl.orientation === 'portrait' ? 'Portrait' : 'Landscape'} card, ${card.w} x ${card.h} mm.`}>
        <TextField
          label="Design name"
          value={tpl.name}
          placeholder="e.g. Employee card 2026"
          onChange={(value) => setTpl((current) => ({ ...current, name: value }))}
          hint={nameError ? <span className="font-[600] text-[#8b3133]">{nameError}</span> : null}
        />
      </StudioSection>

      <StudioSection
        title={`Artwork for the ${sideLabel}`}
        description="Design it in Canva, Figma or Photoshop and leave empty space where the photo and text go."
      >
        <ImagePicker
          label={`${side === 'front' ? 'Front' : 'Back'} artwork`}
          description={`PNG or JPG, ${artwork.w} x ${artwork.h} px for sharp printing.`}
          src={face.background}
          aspect={tpl.orientation === 'portrait' ? 'portrait' : 'wide'}
          onPick={pickArtwork}
          onClear={() => {
            setTpl((current) => ({ ...current, [side]: { ...current[side], background: '' } }));
            setArtworkNotes((current) => ({ ...current, [side]: '' }));
          }}
        />
        {artworkNotes[side] ? (
          <p className="mt-3 rounded-[8px] bg-[#faeeee] px-3 py-2 text-[12.5px] leading-snug font-[600] text-[#8b3133]" role="status">
            {artworkNotes[side]}
          </p>
        ) : null}
      </StudioSection>

      <StudioSection title={`Add to the ${sideLabel}`} description="Each box is filled with the cardholder's details when printing.">
        <div className="flex flex-wrap gap-1.5">
          {[...BASE_BINDINGS, ...fieldBindings].map((bind) => (
            <AddRowButton key={bind} onClick={() => addElement(bind)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {bindingLabel(bind)}
            </AddRowButton>
          ))}
          <AddRowButton onClick={() => addElement('static')}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {BINDING_LABELS.static}
          </AddRowButton>
        </div>
      </StudioSection>

      <StudioSection title="Selected box" description={selected ? undefined : 'Click a box on the card to style it.'}>
        {selected ? (
          <Inspector
            key={selected.id}
            element={selected}
            card={card}
            bindings={[...BASE_BINDINGS, ...fieldBindings, 'static']}
            onChange={(patch) => updateElement(selected.id, patch)}
            onDuplicate={() => duplicateElement(selected)}
            onRemove={() => removeElement(selected.id)}
            onToFront={() => reorder(selected.id, true)}
            onToBack={() => reorder(selected.id, false)}
          />
        ) : null}
      </StudioSection>

      <StudioSection title="Start over" description={`Replaces every box on the ${sideLabel}. Your artwork stays.`}>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton
            onClick={() => {
              setElements(() => starterElements(tpl.orientation, side, draft));
              setSelectedId(null);
            }}
          >
            Use the Classic layout
          </SecondaryButton>
          <SecondaryButton
            onClick={() => {
              setElements(() => []);
              setSelectedId(null);
            }}
          >
            Remove all boxes
          </SecondaryButton>
        </div>
      </StudioSection>
    </>
  );

  const toolbar = (
    <>
      <Segmented<CardSide>
        label="Side"
        value={side}
        onChange={switchSide}
        options={[
          { value: 'front', label: 'Front' },
          { value: 'back', label: 'Back' },
        ]}
      />
      <p className="pb-2 text-[12px] leading-snug text-[#687789]">
        Drag to move, pull a corner to resize. Arrow keys nudge 0.5 mm, Shift moves 2 mm, Delete removes.
      </p>
    </>
  );

  return (
    <StudioShell
      title={isNew ? 'New card design' : `Edit ${template.name}`}
      description="Upload your artwork, then drag boxes onto it to place the photo, name and details."
      onClose={onCancel}
      editor={editor}
      toolbar={toolbar}
      preview={
        <CardCanvas
          template={tpl}
          side={side}
          draft={draft}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChange={(item) => updateElement(item.id, item)}
          onRemove={removeElement}
        />
      }
      status={
        error ? (
          <p className="font-[600] text-[#8b3133]" role="alert">{error}</p>
        ) : (
          <p className="text-[#5e6c7b]">Saved designs are shared with everyone in your organization who prints ID cards.</p>
        )
      }
      actions={
        <>
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[7px] bg-[#17324e] px-4 text-[13.5px] font-[650] whitespace-nowrap text-white transition-colors hover:bg-[#285275] active:translate-y-px disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d628e]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save design
          </button>
        </>
      }
    />
  );
}

function imageSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function artworkNote(size: { w: number; h: number }, target: { w: number; h: number }): string {
  const notes: string[] = [];
  const ratio = size.w / size.h;
  const targetRatio = target.w / target.h;
  if (Math.abs(ratio - targetRatio) / targetRatio > 0.04) {
    notes.push(`This image is ${size.w} x ${size.h} px, which is a different shape from the card, so its edges will be cropped.`);
  }
  if (size.w < target.w * 0.75 || size.h < target.h * 0.75) {
    notes.push(`It is smaller than ${target.w} x ${target.h} px and may print blurry.`);
  }
  return notes.join(' ');
}

interface CardCanvasProps {
  template: CustomCardTemplate;
  side: CardSide;
  draft: IdCardDraft;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (element: CardElement) => void;
  onRemove: (id: string) => void;
}

function CardCanvas({ template, side, draft, selectedId, onSelect, onChange, onRemove }: CardCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; orig: CardElement } | null>(null);
  const [available, setAvailable] = useState(0);
  const [guides, setGuides] = useState({ v: false, h: false });

  const card = CARD_MM[template.orientation];
  const face = template[side];
  const cardPx = { w: card.w * MM_PX, h: card.h * MM_PX };
  const scale = available ? Math.min((available - 8) / cardPx.w, 620 / cardPx.h, 3) : 1;
  const selected = face.elements.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLElement>, item: CardElement, handle: Handle) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(item.id);
    canvasRef.current?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { handle, startX: event.clientX, startY: event.clientY, orig: item };
  };

  const onDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / (MM_PX * scale);
    const dy = (event.clientY - drag.startY) / (MM_PX * scale);
    const { orig, handle } = drag;
    let { x, y, w, h } = orig;
    let v = false;
    let hz = false;

    if (handle === 'move') {
      x = clamp(snap(orig.x + dx), 0, card.w - w);
      y = clamp(snap(orig.y + dy), 0, card.h - h);
      if (Math.abs(x + w / 2 - card.w / 2) < 0.8) {
        x = card.w / 2 - w / 2;
        v = true;
      }
      if (Math.abs(y + h / 2 - card.h / 2) < 0.8) {
        y = card.h / 2 - h / 2;
        hz = true;
      }
    } else {
      if (handle.includes('e')) w = clamp(snap(orig.w + dx), MIN_SIZE, card.w - orig.x);
      if (handle.includes('w')) {
        x = clamp(snap(orig.x + dx), 0, orig.x + orig.w - MIN_SIZE);
        w = orig.x + orig.w - x;
      }
      if (handle.includes('s')) h = clamp(snap(orig.h + dy), MIN_SIZE, card.h - orig.y);
      if (handle.includes('n')) {
        y = clamp(snap(orig.y + dy), 0, orig.y + orig.h - MIN_SIZE);
        h = orig.y + orig.h - y;
      }
    }

    setGuides((current) => (current.v === v && current.h === hz ? current : { v, h: hz }));
    onChange({ ...orig, x: tidy(x), y: tidy(y), w: tidy(w), h: tidy(h) });
  };

  const endDrag = () => {
    dragRef.current = null;
    setGuides({ v: false, h: false });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return;
    const step = event.shiftKey ? 2 : SNAP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      onChange({
        ...selected,
        x: tidy(clamp(selected.x + dx, 0, card.w - selected.w)),
        y: tidy(clamp(selected.y + dy, 0, card.h - selected.h)),
      });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove(selected.id);
    }
  };

  return (
    <div ref={stageRef} className="w-full">
      <div className="mx-auto flex flex-col items-center gap-3" style={{ width: cardPx.w * scale }}>
        <div style={{ width: cardPx.w * scale, height: cardPx.h * scale }}>
          <div
            ref={canvasRef}
            tabIndex={0}
            role="application"
            aria-label={`${side === 'front' ? 'Front' : 'Back'} of the card. Select a box, then use the arrow keys to move it.`}
            onKeyDown={onKeyDown}
            onPointerDown={() => onSelect(null)}
            className="relative overflow-hidden bg-white outline-none focus-visible:ring-[3px] focus-visible:ring-[#d8e8f2]"
            style={{
              width: `${card.w}mm`,
              height: `${card.h}mm`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              borderRadius: '3.18mm',
              fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, "Segoe UI", sans-serif',
              color: '#172234',
              boxShadow: '0 0 0 0.2mm rgba(23, 50, 78, 0.12), 0 3mm 7mm rgba(23, 50, 78, 0.1)',
            }}
          >
            {face.background ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={face.background} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-[6mm] text-center text-[7pt] leading-snug text-[#8a97a6]">
                Upload artwork for the {side} to see your design here.
              </div>
            )}

            {face.elements.map((item) => {
              const active = item.id === selectedId;
              return (
                <div
                  key={item.id}
                  title={bindingLabel(item.bind)}
                  onPointerDown={(event) => startDrag(event, item, 'move')}
                  onPointerMove={onDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="absolute cursor-move"
                  style={{ left: `${item.x}mm`, top: `${item.y}mm`, width: `${item.w}mm`, height: `${item.h}mm`, touchAction: 'none', zIndex: active ? 2 : 1 }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: elementContent(item, draft, true) }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{ outline: active ? '0.3mm solid #2d628e' : '0.2mm dashed rgba(45, 98, 142, 0.55)' }}
                  />
                  {active
                    ? (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                        <span
                          key={corner}
                          onPointerDown={(event) => startDrag(event, item, corner)}
                          className="absolute border-[#2d628e] bg-white"
                          style={{
                            width: '1.8mm',
                            height: '1.8mm',
                            borderWidth: '0.3mm',
                            borderStyle: 'solid',
                            [corner.includes('n') ? 'top' : 'bottom']: '-0.9mm',
                            [corner.includes('w') ? 'left' : 'right']: '-0.9mm',
                            cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                            touchAction: 'none',
                          }}
                        />
                      ))
                    : null}
                </div>
              );
            })}

            {guides.v ? <span className="pointer-events-none absolute top-0 bottom-0 z-[3] bg-[#d0427f]" style={{ left: `${card.w / 2}mm`, width: '0.2mm' }} /> : null}
            {guides.h ? <span className="pointer-events-none absolute right-0 left-0 z-[3] bg-[#d0427f]" style={{ top: `${card.h / 2}mm`, height: '0.2mm' }} /> : null}
          </div>
        </div>
        <p className="text-[12px] font-[600] text-[#5e6c7b]">
          {side === 'front' ? 'Front' : 'Back'}, filled with {draft.name || 'this cardholder'}&apos;s details
        </p>
      </div>
    </div>
  );
}

interface InspectorProps {
  element: CardElement;
  card: { w: number; h: number };
  bindings: CardBinding[];
  onChange: (patch: Partial<CardElement>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onToFront: () => void;
  onToBack: () => void;
}

function Inspector({ element, card, bindings, onChange, onDuplicate, onRemove, onToFront, onToBack }: InspectorProps) {
  const bindId = useId();
  const image = isImageBinding(element.bind);
  const options = bindings.includes(element.bind) ? bindings : [element.bind, ...bindings];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={bindId} className="text-[12px] font-[650] text-[#33435a]">
          Shows
        </label>
        <select
          id={bindId}
          className={inputClass}
          value={element.bind}
          onChange={(event) => {
            const bind = event.target.value as CardBinding;
            onChange({ bind, ...(bind === 'static' && !element.text ? { text: 'Your text' } : {}) });
          }}
        >
          {options.map((bind) => (
            <option key={bind} value={bind}>
              {bindingLabel(bind)}
            </option>
          ))}
        </select>
      </div>

      {element.bind === 'static' ? (
        <TextField label="Text" value={element.text || ''} onChange={(text) => onChange({ text })} />
      ) : null}

      {image ? (
        element.bind !== 'signature' ? (
          <Segmented<NonNullable<CardElement['shape']>>
            label="Shape"
            value={element.shape || 'rect'}
            onChange={(shape) => onChange({ shape })}
            options={[
              { value: 'rect', label: 'Square corners' },
              { value: 'rounded', label: 'Rounded' },
              { value: 'circle', label: 'Circle' },
            ]}
          />
        ) : null
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Text size (pt)" value={element.fontSize} min={4} max={24} step={0.5} onChange={(fontSize) => onChange({ fontSize })} />
            <ColorField label="Text colour" value={element.color} onChange={(color) => onChange({ color })} />
          </div>
          <Segmented<'400' | '600' | '800'>
            label="Weight"
            value={String(element.weight) as '400' | '600' | '800'}
            onChange={(weight) => onChange({ weight: Number(weight) as CardElement['weight'] })}
            options={[
              { value: '400', label: 'Regular' },
              { value: '600', label: 'Semibold' },
              { value: '800', label: 'Bold' },
            ]}
          />
          <div className="flex flex-wrap gap-3">
            <Segmented<CardElement['align']>
              label="Align"
              value={element.align}
              onChange={(align) => onChange({ align })}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Centre' },
                { value: 'right', label: 'Right' },
              ]}
            />
            <Segmented<CardElement['valign']>
              label="Vertical"
              value={element.valign}
              onChange={(valign) => onChange({ valign })}
              options={[
                { value: 'top', label: 'Top' },
                { value: 'middle', label: 'Middle' },
                { value: 'bottom', label: 'Bottom' },
              ]}
            />
          </div>
          <Segmented<'1' | '2' | '3'>
            label="Lines before shortening"
            value={String(element.maxLines) as '1' | '2' | '3'}
            onChange={(lines) => onChange({ maxLines: Number(lines) as CardElement['maxLines'] })}
            options={[
              { value: '1', label: '1 line' },
              { value: '2', label: '2 lines' },
              { value: '3', label: '3 lines' },
            ]}
          />
          <div className="space-y-2">
            <Checkbox label="Show a small label above the value" checked={Boolean(element.showLabel)} onChange={(showLabel) => onChange({ showLabel })} />
            <Checkbox label="Use a monospace font (good for ID numbers)" checked={Boolean(element.mono)} onChange={(mono) => onChange({ mono })} />
            <Checkbox
              label="Fill the box with a colour"
              checked={Boolean(element.background)}
              onChange={(on) => onChange({ background: on ? '#ffffff' : undefined })}
            />
          </div>
          {element.background ? (
            <ColorField label="Box colour" value={element.background} onChange={(background) => onChange({ background })} />
          ) : null}
        </>
      )}

      <div className="grid grid-cols-4 gap-2">
        <NumberField label="X (mm)" value={element.x} min={0} max={card.w - element.w} step={0.5} onChange={(x) => onChange({ x })} />
        <NumberField label="Y (mm)" value={element.y} min={0} max={card.h - element.h} step={0.5} onChange={(y) => onChange({ y })} />
        <NumberField label="Width" value={element.w} min={MIN_SIZE} max={card.w - element.x} step={0.5} onChange={(w) => onChange({ w })} />
        <NumberField label="Height" value={element.h} min={MIN_SIZE} max={card.h - element.y} step={0.5} onChange={(h) => onChange({ h })} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <AddRowButton onClick={onToFront}>
          <ArrowUpToLine className="h-3.5 w-3.5" aria-hidden />
          Bring to front
        </AddRowButton>
        <AddRowButton onClick={onToBack}>
          <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
          Send to back
        </AddRowButton>
        <AddRowButton onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Duplicate
        </AddRowButton>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-[7px] border border-[#e8c9ca] bg-white px-2.5 text-[12.5px] font-[650] text-[#8b3133] transition-colors hover:bg-[#faeeee] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2d628e]"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Remove box
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="truncate text-[12px] font-[650] text-[#33435a]">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className={`${inputClass} px-2`}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(tidy(clamp(next, min, Math.max(min, max))));
        }}
      />
    </div>
  );
}

const canPickFromScreen = () => typeof window !== 'undefined' && 'EyeDropper' in window;

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [text, setText] = useState(value);
  const [eyeDropper, setEyeDropper] = useState(false);

  useEffect(() => setText(value), [value]);
  useEffect(() => setEyeDropper(canPickFromScreen()), []);

  const pick = async () => {
    try {
      const result = await new (window as any).EyeDropper().open();
      if (HEX.test(result?.sRGBHex)) onChange(result.sRGBHex);
    } catch {
      // The user dismissed the picker.
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-[650] text-[#33435a]">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={HEX.test(value) ? value : '#172234'}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-10 shrink-0 cursor-pointer rounded-[7px] border border-[#cad5dc] bg-white p-1"
        />
        <input
          id={id}
          className={`${inputClass} px-2 font-mono text-[12.5px]`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (HEX.test(event.target.value)) onChange(event.target.value);
          }}
        />
        {eyeDropper ? (
          <button
            type="button"
            onClick={pick}
            aria-label="Pick a colour from the artwork"
            title="Pick a colour from the artwork"
            className="flex h-10 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-[#cad5dc] bg-white text-[#33435a] hover:border-[#2d628e] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2d628e]"
          >
            <Pipette className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#33435a]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 cursor-pointer accent-[#17324e]"
      />
      {label}
    </label>
  );
}
