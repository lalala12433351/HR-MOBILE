import type { CardOrientation, IdCardDraft } from './idCardTemplate';
import { escapeHtml, newPrintId, safeImageSrc } from './printWindow';

export type CardSide = 'front' | 'back';

export type CardBinding =
  | 'photo'
  | 'logo'
  | 'signature'
  | 'name'
  | 'roleLine'
  | 'personId'
  | 'idCaption'
  | 'bloodGroup'
  | 'orgName'
  | 'validThrough'
  | 'returnAddress'
  | 'signatoryLabel'
  | `field:${string}`
  | 'static';

export type CardImageShape = 'rect' | 'rounded' | 'circle';

export interface CardElement {
  id: string;
  bind: CardBinding;
  text?: string;
  /** Position and size in millimetres from the card's top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  weight: 400 | 600 | 800;
  color: string;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  maxLines: 1 | 2 | 3;
  shape?: CardImageShape;
  showLabel?: boolean;
  mono?: boolean;
  background?: string;
}

export interface CardFace {
  background: string;
  elements: CardElement[];
}

export interface CustomCardTemplate {
  id: string;
  name: string;
  orientation: CardOrientation;
  front: CardFace;
  back: CardFace;
}

export interface IdCardTemplateSettings {
  templates: CustomCardTemplate[];
  defaults: { employee?: string; student?: string };
}

export const CARD_MM: Record<CardOrientation, { w: number; h: number }> = {
  portrait: { w: 54, h: 85.6 },
  landscape: { w: 85.6, h: 54 },
};

/** Artwork pixel size for 300 dpi at CR80 size. */
export const ARTWORK_PX: Record<CardOrientation, { w: number; h: number }> = {
  portrait: { w: 638, h: 1012 },
  landscape: { w: 1012, h: 638 },
};

export function initials(name: string, fallback = 'ID'): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const IMAGE_BINDINGS: CardBinding[] = ['photo', 'logo', 'signature'];

export function isImageBinding(bind: CardBinding): boolean {
  return IMAGE_BINDINGS.includes(bind);
}

export const BINDING_LABELS: Record<string, string> = {
  photo: 'Photo',
  logo: 'Logo',
  signature: 'Signature',
  name: 'Full name',
  roleLine: 'Role',
  personId: 'ID number',
  idCaption: 'ID label',
  bloodGroup: 'Blood group',
  orgName: 'Organization name',
  validThrough: 'Valid through',
  returnAddress: 'Return address',
  signatoryLabel: 'Signatory title',
  static: 'Custom text',
};

export function bindingLabel(bind: CardBinding): string {
  if (bind.startsWith('field:')) return bind.slice('field:'.length) || 'Detail';
  return BINDING_LABELS[bind] || bind;
}

function findField(draft: IdCardDraft, bind: CardBinding) {
  const label = bind.slice('field:'.length).trim().toLowerCase();
  return draft.fields.find((item) => item.label.trim().toLowerCase() === label);
}

interface ResolvedText {
  value: string;
  caption: string;
  fitId: string;
}

function resolveText(el: CardElement, draft: IdCardDraft): ResolvedText {
  if (el.bind.startsWith('field:')) {
    const field = findField(draft, el.bind);
    return { value: field?.value || '', caption: field?.label || bindingLabel(el.bind), fitId: field?.id || el.id };
  }
  switch (el.bind) {
    case 'name':
      return { value: draft.name, caption: 'Name', fitId: 'name' };
    case 'roleLine':
      return { value: draft.roleLine, caption: 'Role', fitId: 'role' };
    case 'personId':
      return { value: draft.personId, caption: draft.idCaption || 'ID number', fitId: 'personId' };
    case 'idCaption':
      return { value: draft.idCaption, caption: '', fitId: el.id };
    case 'bloodGroup':
      return { value: draft.bloodGroup, caption: 'Blood group', fitId: el.id };
    case 'orgName':
      return { value: draft.orgName, caption: 'Organization', fitId: 'org' };
    case 'validThrough':
      return { value: draft.validThrough, caption: 'Valid through', fitId: el.id };
    case 'returnAddress':
      return { value: draft.returnAddress, caption: 'If found, please return to', fitId: 'return' };
    case 'signatoryLabel':
      return { value: draft.signatoryLabel, caption: '', fitId: el.id };
    default:
      return { value: el.text || '', caption: '', fitId: el.id };
  }
}

const PT_TO_MM = 0.3528;

/** Shrink text (down to 70%) when its length is likely to overflow the box at the chosen size. */
export function fittedFontSize(el: CardElement, text: string): number {
  const charMm = el.fontSize * PT_TO_MM * (el.mono ? 0.6 : 0.54);
  const perLine = Math.max(1, Math.floor(el.w / charMm));
  const capacity = perLine * el.maxLines;
  const length = text.trim().length;
  if (length <= capacity) return el.fontSize;
  const scaled = Math.round(((el.fontSize * capacity) / length) * 10) / 10;
  return Math.max(Math.round(el.fontSize * 7) / 10, scaled);
}

const HEX = /^#[0-9a-f]{6}$/i;
const esc = (value: string) => escapeHtml(value || '');

function clampStyle(lines: number): string {
  if (lines <= 1) return 'display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  return `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${lines};line-clamp:${lines};overflow:hidden;overflow-wrap:anywhere;`;
}

const JUSTIFY = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

export function elementBoxStyle(el: CardElement): string {
  return `left:${el.x}mm;top:${el.y}mm;width:${el.w}mm;height:${el.h}mm;`;
}

function imageRadius(shape: CardImageShape | undefined): string {
  if (shape === 'circle') return '50%';
  if (shape === 'rounded') return '1.6mm';
  return '0';
}

/**
 * Inner markup of one placed element, fully inline-styled so the editor canvas and the print
 * document render it identically. Returns '' for empty values unless `placeholders` is set.
 */
export function elementContent(el: CardElement, draft: IdCardDraft, placeholders = false): string {
  const color = HEX.test(el.color) ? el.color : '#172234';

  if (isImageBinding(el.bind)) {
    const raw = el.bind === 'photo' ? draft.photo : el.bind === 'logo' ? draft.logo : draft.signature;
    const src = safeImageSrc(raw);
    const radius = imageRadius(el.shape);
    const frame = `width:100%;height:100%;overflow:hidden;border-radius:${radius};display:flex;align-items:center;justify-content:center;`;
    if (src) {
      const fit = el.bind === 'photo' ? 'cover;object-position:center 25%' : 'contain';
      return `<div style="${frame}"><img src="${src}" alt="" style="width:100%;height:100%;object-fit:${fit};" /></div>`;
    }
    if (el.bind === 'photo') {
      return `<div style="${frame}background:#e7eef0;color:${color};font-weight:700;font-size:${Math.max(8, el.h * 0.5)}pt;">${esc(initials(draft.name))}</div>`;
    }
    if (!placeholders) return '';
    return `<div style="${frame}border:0.25mm dashed #8a97a6;color:#687789;font-size:5.5pt;font-weight:600;">${esc(bindingLabel(el.bind))}</div>`;
  }

  const { value, caption } = resolveText(el, draft);
  const isPlaceholder = !value.trim();
  if (isPlaceholder && !placeholders) return '';
  const shown = isPlaceholder ? bindingLabel(el.bind) : value;
  const size = fittedFontSize(el, shown);
  const fill = el.background && HEX.test(el.background) ? `background:${el.background};padding:0.6mm 1mm;border-radius:0.8mm;` : '';
  const font = el.mono ? 'font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;' : '';
  const labelPt = Math.max(4.6, Math.round(el.fontSize * 6.2) / 10);
  const label =
    el.showLabel && caption
      ? `<span style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:${labelPt}pt;line-height:1.25;font-weight:600;opacity:0.72;margin-bottom:0.3mm;">${esc(caption)}</span>`
      : '';
  return `<div style="display:flex;flex-direction:column;justify-content:${JUSTIFY[el.valign] || 'flex-start'};height:100%;text-align:${el.align};color:${color};${fill}${isPlaceholder ? 'opacity:0.45;font-style:italic;' : ''}">${label}<span data-fit-text style="font-size:${size}pt;line-height:1.22;font-weight:${el.weight};letter-spacing:${el.weight >= 800 ? '-0.015em' : '0'};${font}${clampStyle(el.maxLines)}">${esc(shown)}</span></div>`;
}

function faceMarkup(draft: IdCardDraft, template: CustomCardTemplate, side: CardSide): string {
  const face = template[side];
  const background = safeImageSrc(face.background);
  const elements = face.elements
    .map((el) => {
      const content = elementContent(el, draft);
      if (!content) return '';
      const fit = isImageBinding(el.bind) ? '' : ` data-fit-id="${esc(resolveText(el, draft).fitId)}"`;
      return `<div class="el" style="${elementBoxStyle(el)}"${fit}>${content}</div>`;
    })
    .join('');
  return `<div class="card ${template.orientation} t-custom">${background ? `<img class="bg" src="${background}" alt="" />` : ''}${elements}</div>`;
}

export function customCardFaces(draft: IdCardDraft, template: CustomCardTemplate): [string, string] {
  return [faceMarkup(draft, template, 'front'), faceMarkup(draft, template, 'back')];
}

export const CUSTOM_CARD_STYLES = `
  .t-custom .bg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
  .t-custom .el { position: absolute; overflow: hidden; }
`;

const ELEMENT_DEFAULTS: Omit<CardElement, 'id' | 'bind' | 'x' | 'y' | 'w' | 'h'> = {
  fontSize: 7,
  weight: 600,
  color: '#172234',
  align: 'left',
  valign: 'top',
  maxLines: 1,
};

function el(bind: CardBinding, x: number, y: number, w: number, h: number, extra: Partial<CardElement> = {}): CardElement {
  return { id: newPrintId('el'), bind, x, y, w, h, ...ELEMENT_DEFAULTS, ...extra };
}

/** A new box for `bind`, centred on the card with sensible defaults for its type. */
export function createElement(bind: CardBinding, orientation: CardOrientation, text?: string): CardElement {
  const card = CARD_MM[orientation];
  const size =
    bind === 'photo' ? { w: 20, h: 25 } : bind === 'logo' ? { w: 8, h: 8 } : bind === 'signature' ? { w: 21, h: 6 } : { w: Math.min(40, card.w - 8), h: 6 };
  const extra: Partial<CardElement> =
    bind === 'photo'
      ? { shape: 'rounded' }
      : bind === 'name'
        ? { fontSize: 11, weight: 800, maxLines: 2, h: 9 }
        : bind === 'personId'
          ? { fontSize: 8, weight: 800, mono: true, showLabel: true, h: 8 }
          : bind.startsWith('field:') || bind === 'bloodGroup' || bind === 'validThrough'
            ? { showLabel: true, h: 7.5 }
            : bind === 'static'
              ? { text: text || 'Your text' }
              : {};
  const w = size.w;
  const h = extra.h ?? size.h;
  return el(bind, round((card.w - w) / 2), round((card.h - h) / 2), w, h, extra);
}

function round(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Box positions matching the Classic layout, used as a starting point on custom artwork. */
export function starterElements(orientation: CardOrientation, side: CardSide, draft: IdCardDraft): CardElement[] {
  const fields = draft.fields.filter((item) => item.value.trim());
  const fieldBind = (index: number): CardBinding => `field:${fields[index].label}`;

  if (orientation === 'portrait' && side === 'front') {
    return [
      el('logo', 4, 6, 7, 7),
      el('orgName', 13, 6.5, 37, 7, { fontSize: 7.6, weight: 800, maxLines: 2, valign: 'middle' }),
      el('photo', 16, 18, 22, 27.5, { shape: 'rounded' }),
      el('name', 4, 48, 46, 9, { fontSize: 11, weight: 800, align: 'center', maxLines: 2, valign: 'middle' }),
      el('roleLine', 4, 57.5, 46, 4.5, { fontSize: 6.8, weight: 400, align: 'center' }),
      el('personId', 4, 70, 30, 8, { fontSize: 8.2, weight: 800, mono: true, showLabel: true, valign: 'bottom' }),
      el('bloodGroup', 36, 70, 14, 8, { fontSize: 7, weight: 800, align: 'right', showLabel: true, valign: 'bottom' }),
    ];
  }
  if (orientation === 'portrait') {
    return [
      el('orgName', 3.5, 3, 47, 4.5, { fontSize: 6.4, weight: 800 }),
      ...fields.slice(0, 5).map((_, index) => el(fieldBind(index), 3.5, 9.5 + index * 8.6, 47, 7.8, { fontSize: 6.8, showLabel: true, maxLines: 2 })),
      el('returnAddress', 3.5, 54, 47, 11, { fontSize: 6, weight: 400, showLabel: true, maxLines: 3 }),
      el('validThrough', 3.5, 70, 22, 7, { fontSize: 6.8, showLabel: true, valign: 'bottom' }),
      el('signature', 29, 67, 21, 6),
      el('signatoryLabel', 29, 73.5, 21, 4, { fontSize: 5.2, align: 'center' }),
    ];
  }
  if (side === 'front') {
    return [
      el('logo', 4, 3, 7, 7),
      el('orgName', 13, 3, 68, 7, { fontSize: 8.4, weight: 800, valign: 'middle' }),
      el('photo', 4, 15, 20, 25, { shape: 'rounded' }),
      el('name', 28, 15, 53, 10, { fontSize: 11.5, weight: 800, maxLines: 2 }),
      el('roleLine', 28, 25.5, 53, 4.5, { fontSize: 6.8, weight: 400 }),
      el('personId', 28, 39, 36, 8, { fontSize: 8.2, weight: 800, mono: true, showLabel: true, valign: 'bottom' }),
      el('bloodGroup', 66, 39, 15, 8, { fontSize: 7, weight: 800, align: 'right', showLabel: true, valign: 'bottom' }),
    ];
  }
  return [
    el('orgName', 4, 2.6, 50, 4.5, { fontSize: 6.4, weight: 800 }),
    el('validThrough', 58, 2, 23.6, 7, { fontSize: 6, align: 'right', showLabel: true }),
    ...fields.slice(0, 6).map((_, index) =>
      el(fieldBind(index), index % 2 === 0 ? 4 : 44, 10.5 + Math.floor(index / 2) * 8.5, 37.6, 7.8, { fontSize: 6.8, showLabel: true, maxLines: 2 })
    ),
    el('returnAddress', 4, 37, 52, 13, { fontSize: 6, weight: 400, showLabel: true, maxLines: 2 }),
    el('signature', 60, 38, 21.6, 6),
    el('signatoryLabel', 60, 45, 21.6, 4, { fontSize: 5.2, align: 'center' }),
  ];
}

export function newCustomTemplate(name: string, orientation: CardOrientation, draft: IdCardDraft): CustomCardTemplate {
  return {
    id: newPrintId('card'),
    name,
    orientation,
    front: { background: '', elements: starterElements(orientation, 'front', draft) },
    back: { background: '', elements: starterElements(orientation, 'back', draft) },
  };
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeElement(raw: any, orientation: CardOrientation): CardElement | null {
  if (!raw || typeof raw.bind !== 'string') return null;
  const card = CARD_MM[orientation];
  const w = num(raw.w, 10, 2, card.w);
  const h = num(raw.h, 6, 2, card.h);
  return {
    id: typeof raw.id === 'string' ? raw.id : newPrintId('el'),
    bind: raw.bind as CardBinding,
    text: typeof raw.text === 'string' ? raw.text : undefined,
    x: num(raw.x, 0, 0, card.w - w),
    y: num(raw.y, 0, 0, card.h - h),
    w,
    h,
    fontSize: num(raw.fontSize, 7, 4, 24),
    weight: raw.weight === 400 || raw.weight === 800 ? raw.weight : 600,
    color: typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color : '#172234',
    align: raw.align === 'center' || raw.align === 'right' ? raw.align : 'left',
    valign: raw.valign === 'middle' || raw.valign === 'bottom' ? raw.valign : 'top',
    maxLines: raw.maxLines === 2 || raw.maxLines === 3 ? raw.maxLines : 1,
    shape: raw.shape === 'circle' || raw.shape === 'rect' ? raw.shape : raw.shape === 'rounded' ? 'rounded' : undefined,
    showLabel: Boolean(raw.showLabel),
    mono: Boolean(raw.mono),
    background: typeof raw.background === 'string' && HEX.test(raw.background) ? raw.background : undefined,
  };
}

function normalizeFace(raw: any, orientation: CardOrientation): CardFace {
  const elements = Array.isArray(raw?.elements) ? raw.elements : [];
  return {
    background: typeof raw?.background === 'string' ? raw.background : '',
    elements: elements.map((item: any) => normalizeElement(item, orientation)).filter(Boolean) as CardElement[],
  };
}

/** Parse the stored `id-card-templates` setting, dropping anything malformed. */
export function normalizeTemplateSettings(raw: any): IdCardTemplateSettings {
  const templates = (Array.isArray(raw?.templates) ? raw.templates : [])
    .filter((item: any) => item && typeof item.id === 'string')
    .map((item: any): CustomCardTemplate => {
      const orientation: CardOrientation = item.orientation === 'portrait' ? 'portrait' : 'landscape';
      return {
        id: item.id,
        name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Custom design',
        orientation,
        front: normalizeFace(item.front, orientation),
        back: normalizeFace(item.back, orientation),
      };
    });
  const defaults = raw?.defaults && typeof raw.defaults === 'object' ? raw.defaults : {};
  return {
    templates,
    defaults: {
      employee: typeof defaults.employee === 'string' ? defaults.employee : undefined,
      student: typeof defaults.student === 'string' ? defaults.student : undefined,
    },
  };
}
