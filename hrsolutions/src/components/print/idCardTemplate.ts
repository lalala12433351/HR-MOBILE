import { escapeHtml, safeImageSrc } from './printWindow';
import { CUSTOM_CARD_STYLES, CustomCardTemplate, customCardFaces, initials } from './cardTemplate';

export { initials } from './cardTemplate';

export interface CardField {
  id: string;
  label: string;
  value: string;
}

export interface IdCardDraft {
  orgName: string;
  logo: string;
  photo: string;
  name: string;
  personId: string;
  idCaption: string;
  roleLine: string;
  bloodGroup: string;
  validThrough: string;
  returnAddress: string;
  signature: string;
  signatoryLabel: string;
  fields: CardField[];
}

export type CardOrientation = 'portrait' | 'landscape';
export type CardPaper = 'a4' | 'cr80';
export type CardRenderMode = 'preview' | 'print';

export type CardPresetId = 'classic' | 'minimal' | 'split' | 'diagonal' | 'dark';

export interface IdCardDesign {
  source: 'preset' | 'custom';
  presetId: CardPresetId;
  templateId?: string;
  orientation: CardOrientation;
  accent: string;
  paper: CardPaper;
}

export interface CardPreset {
  id: CardPresetId;
  name: string;
  description: string;
  orientations: CardOrientation[];
}

export const CARD_PRESETS: CardPreset[] = [
  { id: 'classic', name: 'Classic', description: 'Colour band with the photo overlapping it.', orientations: ['portrait', 'landscape'] },
  { id: 'minimal', name: 'Minimal', description: 'White card, accent edge and a large name.', orientations: ['portrait', 'landscape'] },
  { id: 'split', name: 'Corporate', description: 'Photo on a solid accent panel, details on the right.', orientations: ['landscape'] },
  { id: 'diagonal', name: 'Diagonal', description: 'Angled accent shape behind a round photo.', orientations: ['portrait'] },
  { id: 'dark', name: 'Dark', description: 'Deep navy front with light text.', orientations: ['portrait', 'landscape'] },
];

export function presetById(id: CardPresetId): CardPreset {
  return CARD_PRESETS.find((preset) => preset.id === id) || CARD_PRESETS[0];
}

/** The orientation a preset can actually render, preferring the requested one. */
export function presetOrientation(id: CardPresetId, wanted: CardOrientation): CardOrientation {
  const { orientations } = presetById(id);
  return orientations.includes(wanted) ? wanted : orientations[0];
}

export function visibleFields(fields: CardField[]): CardField[] {
  return fields.filter((item) => item.value.trim());
}

/** Step the font size down as text gets longer so short names stay bold and long names still fit. */
function fitPt(text: string, steps: [number, number][], min: number): number {
  const length = text.trim().length;
  for (const [maxLength, size] of steps) {
    if (length <= maxLength) return size;
  }
  return min;
}

const esc = (value: string) => escapeHtml(value || '');

function logoMarkup(draft: IdCardDraft): string {
  const logo = safeImageSrc(draft.logo);
  if (logo) return `<div class="logo"><img src="${logo}" alt="" /></div>`;
  return `<div class="logo mark">${esc(initials(draft.orgName, 'ORG'))}</div>`;
}

function photoMarkup(draft: IdCardDraft): string {
  const photo = safeImageSrc(draft.photo);
  return `<div class="photo">${photo ? `<img src="${photo}" alt="" />` : esc(initials(draft.name))}</div>`;
}

function fieldMarkup(item: CardField, clamp: 'clamp1' | 'clamp2'): string {
  return `<div class="f" data-fit-id="${esc(item.id)}"><span class="lbl clamp1">${esc(item.label)}</span><span class="val ${clamp}" data-fit-text>${esc(item.value)}</span></div>`;
}

function signatureMarkup(draft: IdCardDraft): string {
  const signature = safeImageSrc(draft.signature);
  return `
    <div class="sign">
      <div class="ink">${signature ? `<img src="${signature}" alt="" />` : ''}</div>
      <span class="lbl line clamp1">${esc(draft.signatoryLabel || 'Authorised signatory')}</span>
    </div>`;
}

function returnMarkup(draft: IdCardDraft, clamp: 'clamp2' | 'clamp3'): string {
  if (!draft.returnAddress.trim()) return '';
  return `
    <div class="return" data-fit-id="return">
      <span class="lbl">If found, please return to</span>
      <span class="val ${clamp}" data-fit-text>${esc(draft.returnAddress)}</span>
    </div>`;
}

function bloodMarkup(draft: IdCardDraft): string {
  if (!draft.bloodGroup.trim()) return '';
  return `<div class="blood"><span class="lbl">Blood group</span><span class="chip">${esc(draft.bloodGroup)}</span></div>`;
}

function idBlockMarkup(draft: IdCardDraft): string {
  return `
    <div class="idblock" data-fit-id="personId">
      <span class="lbl clamp1">${esc(draft.idCaption || 'ID number')}</span>
      <span class="idnum mono clamp1" data-fit-text>${esc(draft.personId || '-')}</span>
    </div>`;
}

function nameMarkup(draft: IdCardDraft, namePt: number): string {
  return `<p class="name clamp2" style="font-size:${namePt}pt" data-fit-id="name" data-fit-text>${esc(draft.name || 'Full name')}</p>`;
}

function roleMarkup(draft: IdCardDraft): string {
  return draft.roleLine.trim() ? `<p class="role clamp1" data-fit-id="role" data-fit-text>${esc(draft.roleLine)}</p>` : '';
}

function orgMarkup(draft: IdCardDraft, clamp: 'clamp1' | 'clamp2', orgPt?: number): string {
  const style = orgPt ? ` style="font-size:${orgPt}pt"` : '';
  return `<p class="org ${clamp}"${style} data-fit-id="org" data-fit-text>${esc(draft.orgName || 'Organization')}</p>`;
}

function portraitFront(draft: IdCardDraft, theme = 't-classic'): string {
  const orgPt = fitPt(draft.orgName, [[22, 7.6], [34, 7]], 6.4);
  const namePt = fitPt(draft.name, [[14, 11.5], [18, 10.5], [22, 9.5], [28, 8.5]], 7.8);
  return `
    <div class="card portrait p-front ${theme}">
      <div class="band">
        <span class="slot"></span>
        <div class="brand">
          ${logoMarkup(draft)}
          <p class="org clamp2" style="font-size:${orgPt}pt" data-fit-id="org" data-fit-text>${esc(draft.orgName || 'Organization')}</p>
        </div>
      </div>
      ${photoMarkup(draft)}
      <div class="who">
        <p class="name clamp2" style="font-size:${namePt}pt" data-fit-id="name" data-fit-text>${esc(draft.name || 'Full name')}</p>
        ${draft.roleLine.trim() ? `<p class="role clamp1" data-fit-id="role" data-fit-text>${esc(draft.roleLine)}</p>` : ''}
      </div>
      <div class="plate">
        <div class="idblock" data-fit-id="personId">
          <span class="lbl clamp1">${esc(draft.idCaption || 'ID number')}</span>
          <span class="idnum mono clamp1" data-fit-text>${esc(draft.personId || '-')}</span>
        </div>
        ${bloodMarkup(draft)}
      </div>
      <div class="stripe"></div>
    </div>`;
}

function portraitBack(draft: IdCardDraft, theme = 't-classic'): string {
  const fields = visibleFields(draft.fields).map((item) => fieldMarkup(item, 'clamp2')).join('');
  return `
    <div class="card portrait p-back ${theme}">
      <div class="head">
        <p class="org clamp1">${esc(draft.orgName || 'Organization')}</p>
      </div>
      <div class="fields" data-fit-box>${fields}</div>
      ${returnMarkup(draft, 'clamp3')}
      <div class="foot">
        <div class="valid">
          <span class="lbl">Valid through</span>
          <span class="val clamp1">${esc(draft.validThrough || '-')}</span>
        </div>
        ${signatureMarkup(draft)}
      </div>
      <div class="stripe"></div>
    </div>`;
}

function landscapeFront(draft: IdCardDraft, theme = 't-classic'): string {
  const orgPt = fitPt(draft.orgName, [[30, 8.4], [44, 7.4]], 6.6);
  const namePt = fitPt(draft.name, [[16, 11.5], [22, 10.5], [28, 9.2]], 8.2);
  return `
    <div class="card landscape l-front ${theme}">
      <div class="band">
        ${logoMarkup(draft)}
        <p class="org clamp2" style="font-size:${orgPt}pt" data-fit-id="org" data-fit-text>${esc(draft.orgName || 'Organization')}</p>
      </div>
      <div class="body">
        ${photoMarkup(draft)}
        <div class="info">
          <p class="name clamp2" style="font-size:${namePt}pt" data-fit-id="name" data-fit-text>${esc(draft.name || 'Full name')}</p>
          ${draft.roleLine.trim() ? `<p class="role clamp1" data-fit-id="role" data-fit-text>${esc(draft.roleLine)}</p>` : ''}
          <div class="meta">
            <div class="idblock" data-fit-id="personId">
              <span class="lbl clamp1">${esc(draft.idCaption || 'ID number')}</span>
              <span class="idnum mono clamp1" data-fit-text>${esc(draft.personId || '-')}</span>
            </div>
            ${bloodMarkup(draft)}
          </div>
        </div>
      </div>
      <div class="stripe"></div>
    </div>`;
}

function landscapeBack(draft: IdCardDraft, theme = 't-classic'): string {
  const fields = visibleFields(draft.fields).map((item) => fieldMarkup(item, 'clamp2')).join('');
  return `
    <div class="card landscape l-back ${theme}">
      <div class="head">
        <p class="org clamp1">${esc(draft.orgName || 'Organization')}</p>
        <p class="valid-inline"><span class="lbl">Valid through</span> <span class="val">${esc(draft.validThrough || '-')}</span></p>
      </div>
      <div class="fields" data-fit-box>${fields}</div>
      <div class="bottom">
        ${returnMarkup(draft, 'clamp2') || '<div></div>'}
        ${signatureMarkup(draft)}
      </div>
      <div class="stripe"></div>
    </div>`;
}

function minimalPortraitFront(draft: IdCardDraft): string {
  const orgPt = fitPt(draft.orgName, [[22, 7], [34, 6.4]], 6);
  const namePt = fitPt(draft.name, [[12, 13], [16, 11.5], [22, 10], [28, 8.8]], 8);
  return `
    <div class="card portrait mp-front t-minimal">
      <span class="edge"></span>
      <div class="top">
        ${orgMarkup(draft, 'clamp2', orgPt)}
        ${logoMarkup(draft)}
      </div>
      <span class="rule"></span>
      ${photoMarkup(draft)}
      <div class="who">
        ${nameMarkup(draft, namePt)}
        ${roleMarkup(draft)}
      </div>
      <div class="plate">
        ${idBlockMarkup(draft)}
        ${bloodMarkup(draft)}
      </div>
    </div>`;
}

function minimalLandscapeFront(draft: IdCardDraft): string {
  const orgPt = fitPt(draft.orgName, [[34, 7.4], [48, 6.6]], 6);
  const namePt = fitPt(draft.name, [[14, 13], [20, 11.5], [26, 10], [32, 9]], 8.2);
  return `
    <div class="card landscape ml-front t-minimal">
      <span class="edge"></span>
      <div class="top">
        ${orgMarkup(draft, 'clamp1', orgPt)}
        ${logoMarkup(draft)}
      </div>
      <div class="body">
        <div class="info">
          <span class="rule"></span>
          ${nameMarkup(draft, namePt)}
          ${roleMarkup(draft)}
          <div class="meta">
            ${idBlockMarkup(draft)}
            ${bloodMarkup(draft)}
          </div>
        </div>
        ${photoMarkup(draft)}
      </div>
    </div>`;
}

function splitLandscapeFront(draft: IdCardDraft): string {
  const namePt = fitPt(draft.name, [[14, 12], [20, 10.8], [26, 9.6], [32, 8.6]], 8);
  return `
    <div class="card landscape sl-front t-split">
      <div class="panel">
        ${logoMarkup(draft)}
        ${photoMarkup(draft)}
      </div>
      <div class="main">
        ${orgMarkup(draft, 'clamp2')}
        ${nameMarkup(draft, namePt)}
        ${roleMarkup(draft)}
        <div class="meta">
          ${idBlockMarkup(draft)}
          ${bloodMarkup(draft)}
        </div>
      </div>
      <div class="stripe"></div>
    </div>`;
}

function diagonalPortraitFront(draft: IdCardDraft): string {
  const orgPt = fitPt(draft.orgName, [[22, 7.6], [34, 7]], 6.4);
  const namePt = fitPt(draft.name, [[14, 11.5], [18, 10.5], [22, 9.5], [28, 8.5]], 7.8);
  return `
    <div class="card portrait dp-front t-diagonal">
      <div class="shape"></div>
      <div class="brand">
        ${logoMarkup(draft)}
        ${orgMarkup(draft, 'clamp2', orgPt)}
      </div>
      ${photoMarkup(draft)}
      <div class="who">
        ${nameMarkup(draft, namePt)}
        ${roleMarkup(draft)}
      </div>
      <div class="plate">
        ${idBlockMarkup(draft)}
        ${bloodMarkup(draft)}
      </div>
      <div class="stripe"></div>
    </div>`;
}

function presetFaces(draft: IdCardDraft, presetId: CardPresetId, wanted: CardOrientation): [string, string] {
  const orientation = presetOrientation(presetId, wanted);
  const theme = `t-${presetId}`;
  const back = orientation === 'portrait' ? portraitBack(draft, theme) : landscapeBack(draft, theme);
  switch (presetId) {
    case 'minimal':
      return [orientation === 'portrait' ? minimalPortraitFront(draft) : minimalLandscapeFront(draft), back];
    case 'split':
      return [splitLandscapeFront(draft), back];
    case 'diagonal':
      return [diagonalPortraitFront(draft), back];
    default:
      return [orientation === 'portrait' ? portraitFront(draft, theme) : landscapeFront(draft, theme), back];
  }
}

/** The orientation that will actually print for this design. */
export function designOrientation(design: IdCardDesign, custom?: CustomCardTemplate | null): CardOrientation {
  if (design.source === 'custom' && custom) return custom.orientation;
  return presetOrientation(design.presetId, design.orientation);
}

function faces(draft: IdCardDraft, design: IdCardDesign, custom?: CustomCardTemplate | null): [string, string] {
  if (design.source === 'custom' && custom) return customCardFaces(draft, custom);
  return presetFaces(draft, design.presetId, design.orientation);
}

const CROP_MARKS = ['h l t', 'h r t', 'h l b', 'h r b', 'v t l', 'v t r', 'v b l', 'v b r']
  .map((position) => `<span class="cm ${position}"></span>`)
  .join('');

export function idCardBody(
  draft: IdCardDraft,
  design: IdCardDesign,
  mode: CardRenderMode,
  custom?: CustomCardTemplate | null
): string {
  const [front, back] = faces(draft, design, custom);
  const orientation = designOrientation(design, custom);

  if (mode === 'preview') {
    return `
      <div class="faces">
        <figure class="face">${front}<figcaption>Front</figcaption></figure>
        <figure class="face">${back}<figcaption>Back</figcaption></figure>
      </div>`;
  }

  if (design.paper === 'cr80') return `${front}${back}`;

  const size = orientation === 'portrait' ? '54 x 85.6 mm' : '85.6 x 54 mm';
  return `
    <div class="sheet">
      <div class="sheet-head">
        <h1>ID card for ${esc(draft.name || 'cardholder')}</h1>
        <p>Printed at actual card size (${size}). Print at 100% scale with "Fit to page" turned off, then cut along the crop marks and laminate front to back.</p>
      </div>
      <div class="pair ${orientation}">
        <figure class="cut"><div class="trim">${front}${CROP_MARKS}</div><figcaption>Front</figcaption></figure>
        <figure class="cut"><div class="trim">${back}${CROP_MARKS}</div><figcaption>Back</figcaption></figure>
      </div>
    </div>`;
}

/** One print document with a sheet (or CR80 pair) for every cardholder. */
export function idCardBatchBody(
  drafts: IdCardDraft[],
  design: IdCardDesign,
  custom?: CustomCardTemplate | null
): string {
  return drafts.map((draft) => idCardBody(draft, design, 'print', custom)).join('');
}

const CARD_STYLES = `
  .card {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    color: #172234;
    border-radius: 3.18mm;
    font-variant-numeric: tabular-nums;
  }
  .card.portrait { width: 54mm; height: 85.6mm; }
  .card.landscape { width: 85.6mm; height: 54mm; }
  .stripe { flex: none; height: 1.6mm; background: var(--accent); margin-top: auto; }

  .clamp1 { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .clamp2, .clamp3 { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .clamp2 { -webkit-line-clamp: 2; line-clamp: 2; }
  .clamp3 { -webkit-line-clamp: 3; line-clamp: 3; }

  .lbl { font-size: 5.2pt; line-height: 1.25; font-weight: 600; color: #687789; letter-spacing: 0.01em; }
  .val { font-size: 6.8pt; line-height: 1.28; font-weight: 600; color: #172234; }

  .logo {
    flex: none;
    width: 7mm;
    height: 7mm;
    border-radius: 1.2mm;
    background: #ffffff;
    padding: 0.6mm;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .logo.mark { color: var(--accent); font-size: 6.4pt; font-weight: 800; letter-spacing: -0.02em; }

  .photo {
    flex: none;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e7eef0;
    color: var(--accent);
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .photo img { width: 100%; height: 100%; object-fit: cover; object-position: center 25%; }

  .name { font-weight: 800; line-height: 1.12; letter-spacing: -0.015em; color: #172234; max-width: 100%; }
  .role { font-size: 6.8pt; line-height: 1.3; font-weight: 500; color: #4b5b6d; max-width: 100%; }
  .idblock { min-width: 0; display: flex; flex-direction: column; gap: 0.3mm; }
  .idnum { font-size: 8.2pt; line-height: 1.2; font-weight: 700; letter-spacing: 0.02em; color: #172234; }
  .blood { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5mm; }
  .chip {
    font-size: 7pt;
    line-height: 1;
    font-weight: 800;
    color: var(--accent);
    border: 0.3mm solid var(--accent);
    border-radius: 0.9mm;
    padding: 0.7mm 1.3mm;
  }

  .f { display: flex; flex-direction: column; gap: 0.3mm; min-width: 0; }
  .return {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 0.4mm;
    min-width: 0;
    padding: 1.5mm 2mm;
    border-radius: 1.2mm;
    background: color-mix(in srgb, var(--accent) 7%, #ffffff);
  }
  .return .val { font-size: 6pt; font-weight: 500; line-height: 1.3; }
  .sign { flex: none; width: 21mm; display: flex; flex-direction: column; align-items: stretch; }
  .sign .ink { height: 6mm; display: flex; align-items: flex-end; justify-content: center; }
  .sign .ink img { max-height: 6mm; max-width: 21mm; object-fit: contain; }
  .sign .line { border-top: 0.25mm solid #9aa6b2; padding-top: 0.6mm; text-align: center; }

  /* Portrait front: lanyard slot, colour band, photo straddling the band */
  .p-front .band { position: relative; flex: none; height: 27mm; padding: 6.6mm 3.5mm 0; background: var(--accent); color: #ffffff; }
  .p-front .slot {
    position: absolute;
    top: 2.4mm;
    left: 50%;
    width: 12mm;
    height: 2.3mm;
    margin-left: -6mm;
    border-radius: 1.15mm;
    background: rgba(255, 255, 255, 0.24);
  }
  .p-front .brand { display: flex; align-items: center; gap: 2mm; }
  .p-front .org { flex: 1; min-width: 0; font-weight: 700; line-height: 1.15; color: #ffffff; }
  .p-front .photo {
    width: 22mm;
    height: 27.5mm;
    margin: -12mm auto 0;
    border: 0.7mm solid #ffffff;
    border-radius: 2mm;
    font-size: 15pt;
    box-shadow: 0 0.5mm 1.4mm rgba(15, 27, 42, 0.18);
  }
  .p-front .who {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 2mm 3.5mm 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.9mm;
    text-align: center;
  }
  .p-front .plate {
    flex: none;
    margin: 0 3.5mm 2.4mm;
    padding-top: 1.8mm;
    border-top: 0.25mm solid #dce2e5;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 2mm;
  }

  /* Portrait back */
  .p-back .head { flex: none; padding: 3mm 3.5mm 1.8mm; border-bottom: 0.25mm solid #e6ebee; }
  .p-back .org, .l-back .org { font-size: 6.4pt; line-height: 1.2; font-weight: 700; color: var(--accent); min-width: 0; }
  .p-back .fields {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 2.2mm 3.5mm 0;
    display: flex;
    flex-direction: column;
    gap: 1.6mm;
  }
  .p-back .return { margin: 1.6mm 3.5mm 0; }
  .p-back .foot { flex: none; padding: 1.8mm 3.5mm 2.2mm; display: flex; align-items: flex-end; justify-content: space-between; gap: 2mm; }
  .p-back .valid { min-width: 0; display: flex; flex-direction: column; gap: 0.3mm; }

  /* Landscape front */
  .l-front .band { flex: none; height: 12.5mm; padding: 0 4mm; display: flex; align-items: center; gap: 2.2mm; background: var(--accent); }
  .l-front .org { flex: 1; min-width: 0; font-weight: 700; line-height: 1.15; color: #ffffff; }
  .l-front .body { flex: 1; min-height: 0; display: flex; gap: 3.5mm; padding: 3mm 4mm 2.4mm; }
  .l-front .photo { width: 20mm; height: 25mm; border-radius: 1.6mm; font-size: 13pt; }
  .l-front .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.8mm; }
  .l-front .meta {
    margin-top: auto;
    padding-top: 1.6mm;
    border-top: 0.25mm solid #dce2e5;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 2mm;
  }

  /* Landscape back */
  .l-back .head {
    flex: none;
    padding: 2.6mm 4mm 1.6mm;
    border-bottom: 0.25mm solid #e6ebee;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 3mm;
  }
  .l-back .org { flex: 1; }
  .l-back .valid-inline { flex: none; font-size: 6pt; white-space: nowrap; }
  .l-back .valid-inline .val { font-size: 6pt; }
  .l-back .fields {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 2mm 4mm 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 1.5mm 3.5mm;
    align-content: start;
  }
  .l-back .bottom { flex: none; display: flex; align-items: flex-end; gap: 3mm; padding: 1.4mm 4mm 2mm; }
  .l-back .bottom > :first-child { flex: 1; min-width: 0; }

  /* Minimal: white card, accent edge, large name */
  .t-minimal .edge { position: absolute; left: 0; top: 0; bottom: 0; width: 1.4mm; background: var(--accent); }
  .t-minimal .top { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 2.5mm; }
  .t-minimal .top .org { flex: 1; min-width: 0; font-weight: 700; line-height: 1.2; color: var(--accent); }
  .t-minimal .logo { width: 6.5mm; height: 6.5mm; padding: 0; background: transparent; }
  .t-minimal .logo.mark { background: color-mix(in srgb, var(--accent) 10%, #ffffff); }
  .t-minimal .rule { display: block; flex: none; width: 8mm; height: 0.6mm; background: var(--accent); }
  .t-minimal .name { font-weight: 800; letter-spacing: -0.025em; }
  .mp-front { padding: 4.2mm 4mm 0 5.6mm; }
  .mp-front .rule { margin: 3mm 0 3.2mm; }
  .mp-front .photo { width: 24mm; height: 30mm; border-radius: 1.6mm; font-size: 15pt; }
  .mp-front .who { flex: 1; min-height: 0; overflow: hidden; padding-top: 2.8mm; display: flex; flex-direction: column; gap: 0.8mm; }
  .mp-front .plate {
    flex: none;
    margin-bottom: 3mm;
    padding-top: 1.8mm;
    border-top: 0.25mm solid #dce2e5;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 2mm;
  }
  .ml-front { padding: 4mm 4.4mm 0 6mm; }
  .ml-front .top { align-items: center; min-height: 6.5mm; }
  .ml-front .body { flex: 1; min-height: 0; display: flex; gap: 4mm; padding: 2.6mm 0 3.2mm; }
  .ml-front .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.8mm; }
  .ml-front .rule { margin-bottom: 1.4mm; }
  .ml-front .photo { width: 20mm; height: 25mm; border-radius: 1.6mm; font-size: 13pt; }
  .ml-front .meta {
    margin-top: auto;
    padding-top: 1.6mm;
    border-top: 0.25mm solid #dce2e5;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 2mm;
  }

  /* Corporate split: accent panel with the photo, details on white */
  .card.sl-front { flex-direction: row; }
  .sl-front .panel {
    flex: none;
    width: 30mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3mm;
    padding-top: 3.8mm;
    background: var(--accent);
  }
  .sl-front .photo { width: 21mm; height: 26mm; border: 0.6mm solid #ffffff; border-radius: 1.6mm; font-size: 13pt; }
  .sl-front .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.8mm; padding: 4.2mm 4mm 4.4mm; }
  .sl-front .org {
    margin-bottom: 2mm;
    font-size: 6pt;
    line-height: 1.25;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .sl-front .meta {
    margin-top: auto;
    padding-top: 1.6mm;
    border-top: 0.25mm solid #dce2e5;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 2mm;
  }
  .sl-front .stripe { position: absolute; left: 30mm; right: 0; bottom: 0; height: 1.2mm; }

  /* Diagonal: angled accent shape behind a round photo */
  .dp-front .shape {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 40mm;
    background: var(--accent);
    clip-path: polygon(0 0, 100% 0, 100% 62%, 0 100%);
  }
  .dp-front .brand { position: relative; flex: none; display: flex; align-items: center; gap: 2mm; padding: 4.4mm 3.5mm 0; }
  .dp-front .org { flex: 1; min-width: 0; font-weight: 700; line-height: 1.15; color: #ffffff; }
  .dp-front .photo {
    width: 25mm;
    height: 25mm;
    margin: 5mm auto 0;
    border: 0.8mm solid #ffffff;
    border-radius: 50%;
    font-size: 15pt;
    box-shadow: 0 0.5mm 1.4mm rgba(15, 27, 42, 0.18);
  }
  .dp-front .who {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 2.4mm 3.5mm 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.9mm;
    text-align: center;
  }
  .dp-front .plate {
    flex: none;
    margin: 0 3.5mm 2.4mm;
    padding-top: 1.8mm;
    border-top: 0.25mm solid #dce2e5;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 2mm;
  }

  /* Dark: deep navy front, light back with a navy header */
  .card.t-dark.p-front, .card.t-dark.l-front { background: #111c2a; color: #f3f6f9; }
  .t-dark.p-front .band, .t-dark.l-front .band { background: color-mix(in srgb, var(--accent) 55%, #111c2a); }
  .t-dark.p-front .photo { border-color: #111c2a; background: #1d2b3c; color: #ffffff; }
  .t-dark.l-front .photo { background: #1d2b3c; color: #ffffff; }
  .t-dark.p-front .name, .t-dark.l-front .name, .t-dark.p-front .idnum, .t-dark.l-front .idnum { color: #f3f6f9; }
  .t-dark.p-front .role, .t-dark.l-front .role { color: #c9d3dd; }
  .t-dark.p-front .lbl, .t-dark.l-front .lbl { color: #b4c0cc; }
  .t-dark.p-front .plate, .t-dark.l-front .meta { border-top-color: rgba(255, 255, 255, 0.16); }
  .t-dark.p-front .chip, .t-dark.l-front .chip { color: #ffffff; background: var(--accent); border-color: rgba(255, 255, 255, 0.6); }
  .t-dark.p-back .head, .t-dark.l-back .head { background: #111c2a; border-bottom: none; }
  .t-dark.p-back .head .org, .t-dark.l-back .head .org { color: #ffffff; }
  .t-dark.l-back .valid-inline .lbl { color: #b4c0cc; }
  .t-dark.l-back .valid-inline .val { color: #ffffff; }
`;

const PREVIEW_STYLES = `
  .faces { display: inline-flex; align-items: flex-start; gap: 9mm; padding: 3mm 4mm 2mm; }
  .face { display: flex; flex-direction: column; align-items: center; gap: 3mm; }
  .face .card {
    box-shadow: 0 0 0 0.2mm rgba(23, 50, 78, 0.1), 0 0.5mm 1mm rgba(23, 50, 78, 0.06), 0 3mm 7mm rgba(23, 50, 78, 0.1);
  }
  .face figcaption { font-size: 8pt; font-weight: 600; color: #5e6c7b; }
`;

const A4_STYLES = `
  @page { size: A4 portrait; margin: 0; }
  .sheet { width: 210mm; min-height: 297mm; padding: 18mm 16mm; page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .sheet-head h1 { font-size: 12pt; font-weight: 700; letter-spacing: -0.01em; }
  .sheet-head p { margin-top: 1.5mm; max-width: 150mm; font-size: 8.5pt; line-height: 1.45; color: #5e6c7b; }
  .pair { display: flex; justify-content: center; gap: 20mm; margin-top: 16mm; }
  .pair.landscape { flex-direction: column; align-items: center; gap: 16mm; }
  .cut { display: flex; flex-direction: column; align-items: center; gap: 7mm; break-inside: avoid; }
  .cut figcaption { font-size: 7.5pt; font-weight: 600; color: #5e6c7b; }
  .trim { position: relative; }
  .trim .card { box-shadow: 0 0 0 0.2mm #cfd8df; }
  .cm { position: absolute; background: #4b5563; }
  .cm.h { width: 4mm; height: 0.15mm; }
  .cm.v { width: 0.15mm; height: 4mm; }
  .cm.h.l { left: -6mm; }
  .cm.h.r { right: -6mm; }
  .cm.h.t { top: 0; }
  .cm.h.b { bottom: 0; }
  .cm.v.t { top: -6mm; }
  .cm.v.b { bottom: -6mm; }
  .cm.v.l { left: 0; }
  .cm.v.r { right: 0; }
`;

function cr80Styles(orientation: CardOrientation): string {
  const size = orientation === 'portrait' ? '54mm 85.6mm' : '85.6mm 54mm';
  return `
    @page { size: ${size}; margin: 0; }
    .card { border-radius: 0; break-after: page; page-break-after: always; }
    .card:last-child { break-after: auto; page-break-after: auto; }
  `;
}

export function idCardStyles(design: IdCardDesign, mode: CardRenderMode, custom?: CustomCardTemplate | null): string {
  const accent = `:root { --accent: ${/^#[0-9a-f]{6}$/i.test(design.accent) ? design.accent : '#17324e'}; }`;
  const base = `${accent}${CARD_STYLES}${CUSTOM_CARD_STYLES}`;
  if (mode === 'preview') return `${base}${PREVIEW_STYLES}`;
  return `${base}${design.paper === 'cr80' ? cr80Styles(designOrientation(design, custom)) : A4_STYLES}`;
}
