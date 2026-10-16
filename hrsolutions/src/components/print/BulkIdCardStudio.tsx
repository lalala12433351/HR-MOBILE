'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Employee, Organization } from '@/types';
import { api } from '@/services/apiClient';
import { compressAvatarImage } from '@/utils/imageUtils';
import { printHtml } from './printWindow';
import {
  CardOrientation,
  CardPaper,
  CardPresetId,
  IdCardDesign,
  IdCardDraft,
  designOrientation,
  idCardBatchBody,
  idCardBody,
  idCardStyles,
  presetById,
  presetOrientation,
} from './idCardTemplate';
import { CustomCardTemplate, IdCardTemplateSettings, newCustomTemplate, normalizeTemplateSettings } from './cardTemplate';
import { CardDesignPicker, DesignKey } from './CardDesignPicker';
import { CardTemplateEditor } from './CardTemplateEditor';
import { buildEmployeeIdCardDraft } from './IdCardStudio';
import {
  ACCENTS,
  AccentPicker,
  ImagePicker,
  PreviewFrame,
  PrintButton,
  SecondaryButton,
  Segmented,
  StudioSection,
  StudioShell,
  TextField,
  measureFit,
  useFitReport,
} from './PrintStudioShell';

interface BulkIdCardStudioProps {
  employees: Employee[];
  organization?: Organization | null;
  isInstitution?: boolean;
  onClose: () => void;
}

function designKey(design: IdCardDesign): DesignKey {
  return design.source === 'custom' && design.templateId ? `custom:${design.templateId}` : `preset:${design.presetId}`;
}

function errorMessage(cause: unknown, fallback: string): string {
  const message = (cause as { message?: string })?.message;
  return message && typeof message === 'string' ? message : fallback;
}

function isActiveEmployee(employee: Employee): boolean {
  if (employee.role === 'super_admin' || employee.employeeId === 'EMP001') return true;
  const status = `${employee.accountStatus || ''} ${employee.status || ''}`.toLowerCase();
  if (/(deactivated|terminated|suspended)/.test(status)) return false;
  return true;
}

export const BulkIdCardStudio: React.FC<BulkIdCardStudioProps> = ({
  employees,
  organization,
  isInstitution,
  onClose,
}) => {
  const [activeOnly, setActiveOnly] = useState(false);
  const roster = useMemo(
    () => (activeOnly ? employees.filter(isActiveEmployee) : employees),
    [employees, activeOnly]
  );

  const baseDrafts = useMemo(
    () => roster.map((employee) => buildEmployeeIdCardDraft(employee, organization)),
    [roster, organization]
  );

  const [shared, setShared] = useState(() => {
    const first = employees[0] ? buildEmployeeIdCardDraft(employees[0], organization) : null;
    return {
      orgName: first?.orgName || '',
      logo: first?.logo || '',
      validThrough: first?.validThrough || '',
      returnAddress: first?.returnAddress || '',
      signature: first?.signature || '',
      signatoryLabel: first?.signatoryLabel || 'Authorised signatory',
    };
  });

  const drafts = useMemo<IdCardDraft[]>(
    () =>
      baseDrafts.map((draft) => ({
        ...draft,
        orgName: shared.orgName,
        logo: shared.logo,
        validThrough: shared.validThrough,
        returnAddress: shared.returnAddress,
        signature: shared.signature,
        signatoryLabel: shared.signatoryLabel,
      })),
    [baseDrafts, shared]
  );

  const previewDraft = drafts[0];
  const [previewIndex, setPreviewIndex] = useState(0);
  const shownDraft = drafts[Math.min(previewIndex, Math.max(drafts.length - 1, 0))] || previewDraft;

  useEffect(() => {
    if (previewIndex >= drafts.length) setPreviewIndex(0);
  }, [drafts.length, previewIndex]);

  const [design, setDesign] = useState<IdCardDesign>({
    source: 'preset',
    presetId: 'classic',
    orientation: 'portrait',
    accent: ACCENTS[0].value,
    paper: 'a4',
  });
  const [, setFit] = useFitReport();
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  const [settings, setSettings] = useState<IdCardTemplateSettings>({ templates: [], defaults: {} });
  const [loadingDesigns, setLoadingDesigns] = useState(true);
  const [editing, setEditing] = useState<{ template: CustomCardTemplate; isNew: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const custom = design.source === 'custom' ? settings.templates.find((item) => item.id === design.templateId) || null : null;
  const activeKey = designKey(design);
  const orientation = designOrientation(design, custom);
  const peopleLabel = isInstitution ? 'staff' : 'employees';

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
  };

  useEffect(() => {
    let cancelled = false;
    api.setup
      .getSettings()
      .then((res: any) => {
        if (cancelled) return;
        const loaded = normalizeTemplateSettings(res?.data?.['id-card-templates']);
        setSettings(loaded);
        const preferred = loaded.defaults.employee;
        if (preferred) selectDesign(preferred, loaded.templates);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingDesigns(false);
      });
    return () => {
      cancelled = true;
    };
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
  };

  const setSharedField = <K extends keyof typeof shared>(key: K, value: (typeof shared)[K]) =>
    setShared((current) => ({ ...current, [key]: value }));

  const pickImage = (key: 'logo' | 'signature', width: number, height: number) => async (file: File) => {
    const dataUrl = await compressAvatarImage(file, width, height, 0.92);
    if (dataUrl) setSharedField(key, dataUrl);
  };

  const previewStyles = useMemo(() => idCardStyles(design, 'preview', custom), [design, custom]);
  const previewBody = useMemo(
    () => (shownDraft ? idCardBody(shownDraft, design, 'preview', custom) : ''),
    [shownDraft, design, custom]
  );

  const handlePrint = async () => {
    if (!drafts.length) {
      setPrintError(`There are no ${peopleLabel} to print.`);
      return;
    }
    setPrinting(true);
    setPrintError('');
    const ok = await printHtml({
      title: `${drafts.length} ID cards`,
      styles: idCardStyles(design, 'print', custom),
      body: idCardBatchBody(drafts, design, custom),
      assetTimeoutMs: Math.min(20_000, 3_000 + drafts.length * 80),
    });
    setPrinting(false);
    if (!ok) setPrintError('The browser blocked printing. Try again, or use Ctrl+P on this page.');
  };

  const editor = (
    <>
      <StudioSection
        title="Who is printed"
        description="Every person in this list gets a front and back on the same design. Open a profile to change one card."
      >
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-[13px] font-[650] text-[#172234]">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(event) => setActiveOnly(event.target.checked)}
            className="h-4 w-4 rounded border-[#cad5dc] text-[#17324e] focus:ring-[#2d628e]"
          />
          Skip deactivated and suspended people
        </label>
        {roster.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[#cad5dc] px-3 py-4 text-center text-[12.5px] text-[#687789]">
            No {peopleLabel} in this list.
          </p>
        ) : (
          <ul className="max-h-56 overflow-y-auto rounded-[8px] border border-[#dce2e5]">
            {roster.map((employee, index) => (
              <li key={employee.id}>
                <button
                  type="button"
                  onClick={() => setPreviewIndex(index)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors ${
                    index === Math.min(previewIndex, roster.length - 1)
                      ? 'bg-[#f8fbfe] text-[#172234]'
                      : 'text-[#33435a] hover:bg-[#f6f5f1]'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-[650]">{employee.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-[#687789]">{employee.employeeId}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[12.5px] text-[#687789]">
          {roster.length} {roster.length === 1 ? 'card' : 'cards'} will print. Click a name to preview it.
        </p>
      </StudioSection>

      <StudioSection title="Shared details" description="Applied to every card in this print.">
        <div className="space-y-4">
          <TextField label="Organization" value={shared.orgName} onChange={(value) => setSharedField('orgName', value)} />
          <ImagePicker
            label="Logo"
            description="Shown on every card."
            src={shared.logo}
            aspect="square"
            onPick={pickImage('logo', 360, 360)}
            onClear={() => setSharedField('logo', '')}
          />
          <TextField
            label="Valid through"
            value={shared.validThrough}
            onChange={(value) => setSharedField('validThrough', value)}
          />
          <TextField
            label="Return address"
            value={shared.returnAddress}
            onChange={(value) => setSharedField('returnAddress', value)}
          />
          <ImagePicker
            label="Signature image"
            description="Printed on the back of every card."
            src={shared.signature}
            aspect="wide"
            onPick={pickImage('signature', 600, 200)}
            onClear={() => setSharedField('signature', '')}
          />
          <TextField
            label="Signatory title"
            value={shared.signatoryLabel}
            onChange={(value) => setSharedField('signatoryLabel', value)}
          />
        </div>
      </StudioSection>
    </>
  );

  const preset = presetById(design.presetId);
  const toolbar = (
    <>
      <CardDesignPicker
        value={activeKey}
        accent={design.accent}
        templates={settings.templates}
        defaultKey={settings.defaults.employee}
        loading={loadingDesigns}
        onChange={(key) => selectDesign(key, settings.templates)}
        onCreate={(next) => {
          setSaveError('');
          const sample = shownDraft || buildEmployeeIdCardDraft(employees[0], organization);
          setEditing({
            template: newCustomTemplate(`Custom design ${settings.templates.length + 1}`, next, sample),
            isNew: true,
          });
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
    </>
  );

  if (editing && (shownDraft || employees[0])) {
    return (
      <CardTemplateEditor
        template={editing.template}
        draft={shownDraft || buildEmployeeIdCardDraft(employees[0], organization)}
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
      title={isInstitution ? 'Print staff ID cards' : 'Print employee ID cards'}
      description={`${roster.length} ${roster.length === 1 ? 'card' : 'cards'} on one job. Print at 100% scale with “Fit to page” turned off.`}
      onClose={onClose}
      editor={editor}
      toolbar={toolbar}
      preview={
        shownDraft ? (
          <PreviewFrame
            title="ID card preview"
            styles={previewStyles}
            body={previewBody}
            maxScale={orientation === 'portrait' ? 1.7 : 1.25}
            measure={measureFit}
            onMeasure={setFit}
          />
        ) : (
          <p className="text-[13px] text-[#687789]">No card to preview.</p>
        )
      }
      status={
        printError ? (
          <p className="font-[600] text-[#8b3133]" role="alert">
            {printError}
          </p>
        ) : (
          <p className="text-[#5e6c7b]">
            Previewing {shownDraft?.name || '—'}
            {drafts.length > 1 ? ` · ${Math.min(previewIndex, drafts.length - 1) + 1} of ${drafts.length}` : ''}
          </p>
        )
      }
      actions={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrintButton busy={printing} onClick={handlePrint}>
            Print {drafts.length} {drafts.length === 1 ? 'card' : 'cards'}
          </PrintButton>
        </>
      }
    />
  );
};
