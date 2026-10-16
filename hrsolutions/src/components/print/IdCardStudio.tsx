'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { Employee, Organization, Student } from '@/types';
import { api } from '@/services/apiClient';
import { compressAvatarImage } from '@/utils/imageUtils';
import { newPrintId, printHtml } from './printWindow';
import {
  CardField,
  CardOrientation,
  CardPaper,
  CardPresetId,
  IdCardDesign,
  IdCardDraft,
  designOrientation,
  idCardBody,
  idCardStyles,
  presetById,
  presetOrientation,
} from './idCardTemplate';
import { CustomCardTemplate, IdCardTemplateSettings, newCustomTemplate, normalizeTemplateSettings } from './cardTemplate';
import { CardDesignPicker, DesignKey } from './CardDesignPicker';
import { CardTemplateEditor } from './CardTemplateEditor';
import {
  ACCENTS,
  AccentPicker,
  AddRowButton,
  FitBadge,
  FitReport,
  FitStatus,
  ImagePicker,
  PreviewFrame,
  PrintButton,
  RowControls,
  SecondaryButton,
  Segmented,
  StudioSection,
  StudioShell,
  TextField,
  inputClass,
  measureFit,
  moveItem,
  useFitReport,
} from './PrintStudioShell';

export type { CardField, IdCardDraft } from './idCardTemplate';

export type IdCardAudience = 'employee' | 'student';

interface IdCardStudioProps {
  title: string;
  roleFieldLabel: string;
  audience: IdCardAudience;
  initial: IdCardDraft;
  onClose: () => void;
}

function designKey(design: IdCardDesign): DesignKey {
  return design.source === 'custom' && design.templateId ? `custom:${design.templateId}` : `preset:${design.presetId}`;
}

function errorMessage(cause: unknown, fallback: string): string {
  const message = (cause as { message?: string })?.message;
  return message && typeof message === 'string' ? message : fallback;
}

function clean(value: string | undefined | null): string {
  const trimmed = (value || '').trim();
  return trimmed === '—' || trimmed === '-' ? '' : trimmed;
}

function field(label: string, value: string | undefined | null): CardField {
  return { id: newPrintId('fld'), label, value: clean(value) };
}

function validThroughDefault(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function orgDisplayName(org?: Pick<Organization, 'name' | 'legalName'> | null): string {
  return org?.legalName || org?.name || '';
}

export function buildEmployeeIdCardDraft(employee: Employee, org?: Organization | null): IdCardDraft {
  const emergency = [clean(employee.emergencyContact?.name), clean(employee.emergencyContact?.phone)]
    .filter(Boolean)
    .join(', ');
  const office = clean(employee.officeName) || clean(employee.location);

  return {
    orgName: orgDisplayName(org),
    logo: org?.logo || '',
    photo: employee.avatar || '',
    name: clean(employee.name),
    personId: clean(employee.employeeId),
    idCaption: 'Employee ID',
    roleLine: clean(employee.designation),
    bloodGroup: clean(employee.bloodGroup),
    validThrough: validThroughDefault(),
    returnAddress: clean(org?.officeLocation?.address) || office,
    signature: '',
    signatoryLabel: 'Authorised signatory',
    fields: [
      field('Department', employee.department),
      field('Emergency contact', emergency),
      field('Phone', employee.phone),
      field('Email', employee.email),
      field('Date of joining', employee.joinDate || employee.joiningDate),
      field('Work location', office),
    ],
  };
}

export function buildStudentIdCardDraft(
  student: Student,
  org?: Pick<Organization, 'name' | 'legalName' | 'officeLocation'> & Partial<Pick<Organization, 'logo'>> | null
): IdCardDraft {
  const section = clean(student.section);
  const gradeLine = [clean(student.grade), section && !/^sec/i.test(section) ? `Section ${section}` : section]
    .filter(Boolean)
    .join(', ');
  const guardian = [clean(student.guardianName), clean(student.guardianPhone)].filter(Boolean).join(', ');

  return {
    orgName: orgDisplayName(org),
    logo: org?.logo || '',
    photo: student.avatar || '',
    name: clean(student.name),
    personId: clean(student.rollNumber) || clean(student.studentId),
    idCaption: 'Roll number',
    roleLine: gradeLine,
    bloodGroup: '',
    validThrough: validThroughDefault(),
    returnAddress: clean(org?.officeLocation?.address),
    signature: '',
    signatoryLabel: 'Principal',
    fields: [
      field('Guardian', guardian),
      field('Batch', student.shiftTiming?.shiftName),
      field('Phone', student.phone),
      field('Email', student.email),
    ],
  };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export const IdCardStudio: React.FC<IdCardStudioProps> = ({ title, roleFieldLabel, audience, initial, onClose }) => {
  const [draft, setDraft] = useState<IdCardDraft>(initial);
  const [design, setDesign] = useState<IdCardDesign>({
    source: 'preset',
    presetId: 'classic',
    orientation: 'portrait',
    accent: ACCENTS[0].value,
    paper: 'a4',
  });
  const [fit, setFit] = useFitReport();
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  const [settings, setSettings] = useState<IdCardTemplateSettings>({ templates: [], defaults: {} });
  const [loadingDesigns, setLoadingDesigns] = useState(true);
  const [editing, setEditing] = useState<{ template: CustomCardTemplate; isNew: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState('');

  const custom = design.source === 'custom' ? settings.templates.find((item) => item.id === design.templateId) || null : null;
  const activeKey = designKey(design);
  const orientation = designOrientation(design, custom);

  const selectDesign = (key: string, templates: CustomCardTemplate[]) => {
    if (key.startsWith('custom:')) {
      const id = key.slice('custom:'.length);
      if (!templates.some((item) => item.id === id)) return;
      setDesign((current) => ({ ...current, source: 'custom', templateId: id }));
    } else if (key.startsWith('preset:')) {
      const presetId = key.slice('preset:'.length) as CardPresetId;
      setDesign((current) => ({
        ...current,
        source: 'preset',
        presetId: presetById(presetId).id,
        templateId: undefined,
        orientation: presetOrientation(presetById(presetId).id, current.orientation),
      }));
    }
    setConfirmDelete(false);
    setNotice('');
  };

  useEffect(() => {
    let cancelled = false;
    api.setup
      .getSettings()
      .then((res: any) => {
        if (cancelled) return;
        const loaded = normalizeTemplateSettings(res?.data?.['id-card-templates']);
        setSettings(loaded);
        const preferred = loaded.defaults[audience];
        if (preferred) selectDesign(preferred, loaded.templates);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingDesigns(false);
      });
    return () => {
      cancelled = true;
    };
    // Load once when the studio opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = async (next: IdCardTemplateSettings, onError: (message: string) => void): Promise<boolean> => {
    setSaving(true);
    try {
      await api.setup.saveIdCardTemplates(next);
      setSettings(next);
      return true;
    } catch (cause) {
      onError(errorMessage(cause, 'The design could not be saved. Check your connection and try again.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveTemplate = async (template: CustomCardTemplate) => {
    setSaveError('');
    const exists = settings.templates.some((item) => item.id === template.id);
    const templates = exists
      ? settings.templates.map((item) => (item.id === template.id ? template : item))
      : [...settings.templates, template];
    const ok = await persist({ ...settings, templates }, setSaveError);
    if (!ok) return;
    setEditing(null);
    setDesign((current) => ({ ...current, source: 'custom', templateId: template.id }));
    setNotice(`${template.name} saved.`);
  };

  const duplicateTemplate = async (template: CustomCardTemplate) => {
    setPrintError('');
    const copy: CustomCardTemplate = { ...template, id: newPrintId('card'), name: `${template.name} copy` };
    const ok = await persist({ ...settings, templates: [...settings.templates, copy] }, setPrintError);
    if (!ok) return;
    setDesign((current) => ({ ...current, source: 'custom', templateId: copy.id }));
    setNotice(`${copy.name} created.`);
  };

  const deleteTemplate = async (template: CustomCardTemplate) => {
    setPrintError('');
    const key = `custom:${template.id}`;
    const defaults = { ...settings.defaults };
    (Object.keys(defaults) as IdCardAudience[]).forEach((who) => {
      if (defaults[who] === key) delete defaults[who];
    });
    const ok = await persist({ templates: settings.templates.filter((item) => item.id !== template.id), defaults }, setPrintError);
    setConfirmDelete(false);
    if (!ok) return;
    setDesign((current) => ({ ...current, source: 'preset', templateId: undefined }));
    setNotice(`${template.name} deleted.`);
  };

  const makeDefault = async () => {
    setPrintError('');
    const ok = await persist({ ...settings, defaults: { ...settings.defaults, [audience]: activeKey } }, setPrintError);
    if (ok) setNotice(`New ${audience} ID cards will open with this design.`);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const previewStyles = useMemo(() => idCardStyles(design, 'preview', custom), [design, custom]);
  const previewBody = useMemo(() => idCardBody(draft, design, 'preview', custom), [draft, design, custom]);

  const set = <K extends keyof IdCardDraft>(key: K, value: IdCardDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const updateField = (id: string, patch: Partial<CardField>) =>
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));

  const pickImage = (key: 'photo' | 'logo' | 'signature', width: number, height: number) => async (file: File) => {
    const dataUrl = await compressAvatarImage(file, width, height, 0.92);
    if (dataUrl) set(key, dataUrl);
  };

  const issues = useMemo(() => describeFit(fit, draft, roleFieldLabel), [fit, draft, roleFieldLabel]);

  const handlePrint = async () => {
    setPrinting(true);
    setPrintError('');
    const ok = await printHtml({
      title: `${draft.name || 'ID card'} ID card`,
      styles: idCardStyles(design, 'print', custom),
      body: idCardBody(draft, design, 'print', custom),
    });
    setPrinting(false);
    if (!ok) setPrintError('The browser blocked printing. Try again, or use Ctrl+P on this page.');
  };

  const editor = (
    <>
      <StudioSection title="Cardholder" description="Printed on the front of the card.">
        <div className="space-y-4">
          <ImagePicker
            label="Photo"
            description="A passport-style photo, face centred. Cropped to 3:4."
            src={draft.photo}
            aspect="portrait"
            onPick={pickImage('photo', 720, 720)}
            onClear={() => set('photo', '')}
          />
          <TextField label="Full name" value={draft.name} onChange={(value) => set('name', value)} hint={<FitHint state={fit.name} />} />
          <TextField label={roleFieldLabel} value={draft.roleLine} onChange={(value) => set('roleLine', value)} hint={<FitHint state={fit.role} />} />
          <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3">
            <TextField label="ID label" value={draft.idCaption} onChange={(value) => set('idCaption', value)} />
            <TextField
              label="ID number"
              mono
              value={draft.personId}
              onChange={(value) => set('personId', value)}
              hint={<FitHint state={fit.personId} />}
            />
          </div>
          <TextField
            label="Blood group"
            value={draft.bloodGroup}
            placeholder="e.g. B+"
            onChange={(value) => set('bloodGroup', value)}
            hint={<span className="text-[#687789]">Leave empty to hide it from the card.</span>}
          />
        </div>
      </StudioSection>

      <StudioSection title="Organization">
        <div className="space-y-4">
          <ImagePicker
            label="Logo"
            description="Shown on a white tile in the header. PNG with transparency works best."
            src={draft.logo}
            onPick={pickImage('logo', 400, 400)}
            onClear={() => set('logo', '')}
          />
          <TextField label="Organization name" value={draft.orgName} onChange={(value) => set('orgName', value)} hint={<FitHint state={fit.org} />} />
          <TextField
            label="Return address"
            value={draft.returnAddress}
            placeholder="Office address printed on the back"
            onChange={(value) => set('returnAddress', value)}
            hint={<FitHint state={fit.return} />}
          />
          <TextField label="Valid through" value={draft.validThrough} onChange={(value) => set('validThrough', value)} />
        </div>
      </StudioSection>

      <StudioSection
        title="Back of card"
        description="Printed in this order. Empty values are skipped. Move important details up."
        action={
          <AddRowButton onClick={() => set('fields', [...draft.fields, field('New detail', '')])}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add
          </AddRowButton>
        }
      >
        <div className="space-y-2.5">
          {draft.fields.map((item, index) => (
            <div key={item.id} className="rounded-[8px] border border-[#e3e8eb] bg-[#fbfcfc] p-2">
              <div className="flex items-center gap-1.5">
                <input
                  aria-label="Detail label"
                  className={`${inputClass} w-[38%] shrink-0 text-[12.5px] font-[600] text-[#33435a]`}
                  value={item.label}
                  onChange={(event) => updateField(item.id, { label: event.target.value })}
                />
                <input
                  aria-label={`${item.label || 'Detail'} value`}
                  className={inputClass}
                  value={item.value}
                  placeholder="Not printed when empty"
                  onChange={(event) => updateField(item.id, { value: event.target.value })}
                />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 pl-0.5">
                <span>
                  <FitBadge state={fit[item.id]} />
                </span>
                <RowControls
                  label={item.label || 'detail'}
                  onUp={index > 0 ? () => set('fields', moveItem(draft.fields, index, -1)) : undefined}
                  onDown={index < draft.fields.length - 1 ? () => set('fields', moveItem(draft.fields, index, 1)) : undefined}
                  onRemove={() => set('fields', draft.fields.filter((row) => row.id !== item.id))}
                />
              </div>
            </div>
          ))}
          {draft.fields.length === 0 ? (
            <p className="rounded-[8px] border border-dashed border-[#cad5dc] px-3 py-4 text-center text-[12.5px] text-[#687789]">
              No details on the back yet. Add phone, department or an emergency contact.
            </p>
          ) : null}
        </div>
      </StudioSection>

      <StudioSection title="Signature" description="Printed above the signatory line on the back.">
        <div className="space-y-4">
          <ImagePicker
            label="Signature image"
            description="A scan on white or transparent background."
            src={draft.signature}
            aspect="wide"
            onPick={pickImage('signature', 600, 200)}
            onClear={() => set('signature', '')}
          />
          <TextField label="Signatory title" value={draft.signatoryLabel} onChange={(value) => set('signatoryLabel', value)} />
        </div>
      </StudioSection>
    </>
  );

  const preset = presetById(design.presetId);
  const linkButton =
    'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[7px] px-2 text-[12.5px] font-[650] text-[#2d628e] transition-colors hover:bg-[#eef2f4] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2d628e]';

  const toolbar = (
    <>
      <CardDesignPicker
        value={activeKey}
        accent={design.accent}
        templates={settings.templates}
        defaultKey={settings.defaults[audience]}
        loading={loadingDesigns}
        onChange={(key) => selectDesign(key, settings.templates)}
        onCreate={(next) => {
          setSaveError('');
          setEditing({ template: newCustomTemplate(`Custom design ${settings.templates.length + 1}`, next, draft), isNew: true });
        }}
      />
      {design.source === 'preset' && preset.orientations.length > 1 ? (
        <Segmented<CardOrientation>
          label="Layout"
          value={orientation}
          onChange={(next) => setDesign((current) => ({ ...current, orientation: next }))}
          options={[
            { value: 'portrait', label: 'Portrait badge' },
            { value: 'landscape', label: 'Landscape' },
          ]}
        />
      ) : null}
      {design.source === 'preset' ? (
        <AccentPicker value={design.accent} onChange={(accent) => setDesign((current) => ({ ...current, accent }))} />
      ) : null}
      <Segmented<CardPaper>
        label="Print on"
        value={design.paper}
        onChange={(paper) => setDesign((current) => ({ ...current, paper }))}
        options={[
          { value: 'a4', label: 'A4 with crop marks' },
          { value: 'cr80', label: 'PVC card printer' },
        ]}
      />
      <div className="flex flex-wrap items-center gap-0.5 pb-0.5">
        {custom ? (
          <>
            <button type="button" className={linkButton} onClick={() => { setSaveError(''); setEditing({ template: custom, isNew: false }); }}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit design
            </button>
            <button type="button" className={linkButton} disabled={saving} onClick={() => duplicateTemplate(custom)}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Duplicate
            </button>
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  className={`${linkButton} text-[#8b3133] hover:bg-[#faeeee]`}
                  disabled={saving}
                  onClick={() => deleteTemplate(custom)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete {custom.name} for everyone
                </button>
                <button type="button" className={linkButton} onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" className={`${linkButton} text-[#8b3133] hover:bg-[#faeeee]`} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete
              </button>
            )}
          </>
        ) : null}
        {settings.defaults[audience] !== activeKey && !loadingDesigns ? (
          <button type="button" className={linkButton} disabled={saving} onClick={makeDefault}>
            <Star className="h-3.5 w-3.5" aria-hidden />
            Set as default
          </button>
        ) : null}
      </div>
    </>
  );

  if (editing) {
    return (
      <CardTemplateEditor
        template={editing.template}
        draft={draft}
        isNew={editing.isNew}
        saving={saving}
        error={saveError}
        onSave={saveTemplate}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <StudioShell
      title={title}
      description="Standard CR80 card, 85.6 x 54 mm. The preview is the exact print output."
      onClose={onClose}
      editor={editor}
      toolbar={toolbar}
      preview={
        <PreviewFrame<FitReport>
          title={title}
          styles={previewStyles}
          body={previewBody}
          maxScale={orientation === 'portrait' ? 1.7 : 1.25}
          measure={measureFit}
          onMeasure={setFit}
        />
      }
      status={
        printError ? (
          <p className="font-[600] text-[#8b3133]" role="alert">{printError}</p>
        ) : notice ? (
          <p className="font-[600] text-[#3f7259]" role="status">{notice}</p>
        ) : (
          <FitStatus issues={issues} okText="Everything fits on the card." />
        )
      }
      actions={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrintButton busy={printing} onClick={handlePrint}>
            Print card
          </PrintButton>
        </>
      }
    />
  );
};

function FitHint({ state }: { state?: FitReport[string] }) {
  if (!state) return null;
  return (
    <span className="font-[600] text-[#8b3133]">
      {state === 'hidden' ? 'Does not fit on the card.' : 'Too long, it is shortened on the card.'}
    </span>
  );
}

function describeFit(fit: FitReport, draft: IdCardDraft, roleFieldLabel: string): string[] {
  const labels: Record<string, string> = {
    name: 'Name',
    org: 'Organization name',
    role: roleFieldLabel,
    personId: draft.idCaption || 'ID number',
    return: 'Return address',
  };
  draft.fields.forEach((item) => {
    labels[item.id] = item.label || 'A detail';
  });

  const hidden = Object.keys(fit).filter((id) => fit[id] === 'hidden').map((id) => labels[id]).filter(Boolean);
  const shortened = Object.keys(fit).filter((id) => fit[id] === 'truncated').map((id) => labels[id]).filter(Boolean);
  const messages: string[] = [];
  if (hidden.length) {
    messages.push(
      `${joinNames(hidden)} ${hidden.length === 1 ? 'does' : 'do'} not fit on the back. Remove a detail or try the landscape layout.`
    );
  }
  if (shortened.length) {
    messages.push(`${joinNames(shortened)} ${shortened.length === 1 ? 'is' : 'are'} shortened to fit.`);
  }
  return messages;
}
