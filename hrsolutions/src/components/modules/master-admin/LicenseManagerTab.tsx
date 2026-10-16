'use client';

import React, { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { ClientTenant, LicensePlan } from '@/types';
import { api } from '@/services/apiClient';

export interface CustomSubscriptionPlan {
  id: string;
  key: string;
  name: string;
  description?: string;
  price: number;
  priceAnnual?: number;
  maxSeats: number;
  trialDays?: number;
  features: string[];
  activeClientsCount: number;
  isActive?: boolean;
  isPublic?: boolean;
  sortOrder?: number;
}

export function mapApiPlan(row: any): CustomSubscriptionPlan {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || '',
    price: Number(row.priceMonthly ?? row.price_monthly ?? row.price ?? 0) || 0,
    priceAnnual: Number(row.priceAnnual ?? row.price_annual ?? 0) || 0,
    maxSeats: Number(row.maxSeats ?? row.max_seats ?? 25) || 25,
    trialDays: Number(row.trialDays ?? row.trial_days ?? 0) || 0,
    features: Array.isArray(row.features) ? row.features : [],
    activeClientsCount: Number(row.activeClientsCount ?? row.active_clients_count ?? 0) || 0,
    isActive: row.isActive !== false && row.is_active !== false,
    isPublic: row.isPublic !== false && row.is_public !== false,
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 100) || 100,
  };
}

function emptyDraft(): {
  name: string;
  key: string;
  description: string;
  price: number;
  priceAnnual: number;
  seats: number;
  trialDays: number;
  features: string;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
} {
  return {
    name: '',
    key: '',
    description: '',
    price: 99,
    priceAnnual: 990,
    seats: 25,
    trialDays: 14,
    features: '',
    isPublic: true,
    isActive: true,
    sortOrder: 100,
  };
}

function draftFromPlan(plan: CustomSubscriptionPlan) {
  return {
    name: plan.name,
    key: plan.key,
    description: plan.description || '',
    price: plan.price,
    priceAnnual: plan.priceAnnual || 0,
    seats: plan.maxSeats,
    trialDays: plan.trialDays || 0,
    features: plan.features.join('\n'),
    isPublic: plan.isPublic !== false,
    isActive: plan.isActive !== false,
    sortOrder: plan.sortOrder || 100,
  };
}

function slugifyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function LicenseManagerTab({
  plans,
  tenants,
  isLoading,
  loadError,
  onPlansChange,
  onToast,
}: {
  plans: CustomSubscriptionPlan[];
  tenants: ClientTenant[];
  isLoading: boolean;
  loadError?: string;
  onPlansChange: (next: CustomSubscriptionPlan[]) => void;
  onToast: (toast: { title: string; message: string; type: 'system' }) => void;
}) {
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomSubscriptionPlan | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CustomSubscriptionPlan | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = [...plans].sort((a, b) => (a.sortOrder || 100) - (b.sortOrder || 100) || a.name.localeCompare(b.name));
    if (!q) return rows;
    return rows.filter((plan) =>
      [plan.name, plan.key, plan.description, ...(plan.features || [])].join(' ').toLowerCase().includes(q)
    );
  }, [plans, query]);

  const workspacesFor = (plan: CustomSubscriptionPlan) =>
    tenants.filter((tenant) => tenant.planId === plan.id || tenant.plan === plan.key || tenant.planName === plan.name);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setShowEditor(true);
  };

  const openEdit = (plan: CustomSubscriptionPlan) => {
    setEditing(plan);
    setDraft(draftFromPlan(plan));
    setShowEditor(true);
  };

  const persist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);
    const features = draft.features.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    const payload = {
      name: draft.name.trim(),
      key: slugifyKey(draft.key || draft.name),
      description: draft.description.trim(),
      priceMonthly: Number(draft.price) || 0,
      priceAnnual: Number(draft.priceAnnual) || 0,
      maxSeats: Number(draft.seats) || 25,
      trialDays: Number(draft.trialDays) || 0,
      features,
      isPublic: draft.isPublic,
      isActive: draft.isActive,
      sortOrder: Number(draft.sortOrder) || 100,
    };
    try {
      if (editing) {
        const res = await api.controlPlane.updateLicensePlan(editing.id, payload);
        if (res.data) {
          const mapped = mapApiPlan(res.data as LicensePlan);
          onPlansChange(plans.map((plan) => (plan.id === mapped.id ? mapped : plan)));
        }
        onToast({ title: 'License saved', message: `${payload.name} was updated.`, type: 'system' });
      } else {
        const res = await api.controlPlane.createLicensePlan(payload);
        if (res.data) onPlansChange([...plans, mapApiPlan(res.data as LicensePlan)]);
        onToast({ title: 'License created', message: `${payload.name} is available for workspaces.`, type: 'system' });
      }
      setShowEditor(false);
      setEditing(null);
    } catch (err: any) {
      onToast({ title: 'License could not be saved', message: err?.message || 'The server rejected the license.', type: 'system' });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (plan: CustomSubscriptionPlan) => {
    setBusyId(plan.id);
    try {
      const res = await api.controlPlane.deactivateLicensePlan(plan.id);
      if ((res.data as any)?.deleted) {
        onPlansChange(plans.filter((item) => item.id !== plan.id));
        onToast({ title: 'License deleted', message: `${plan.name} was removed.`, type: 'system' });
      } else if (res.data) {
        const mapped = mapApiPlan(res.data);
        onPlansChange(plans.map((item) => (item.id === mapped.id ? mapped : item)));
        onToast({ title: 'License deactivated', message: `${plan.name} is hidden from signup.`, type: 'system' });
      }
    } catch (err: any) {
      onToast({ title: 'Could not remove license', message: err?.message || 'Request failed.', type: 'system' });
    } finally {
      setBusyId(null);
      setPendingDelete(null);
    }
  };

  const reactivate = async (plan: CustomSubscriptionPlan) => {
    setBusyId(plan.id);
    try {
      const res = await api.controlPlane.updateLicensePlan(plan.id, { isActive: true, isPublic: true });
      if (res.data) {
        const mapped = mapApiPlan(res.data);
        onPlansChange(plans.map((item) => (item.id === mapped.id ? mapped : item)));
      }
      onToast({ title: 'License restored', message: `${plan.name} is active again.`, type: 'system' });
    } catch (err: any) {
      onToast({ title: 'Could not restore license', message: err?.message || 'Request failed.', type: 'system' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Licenses</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search licenses"
            className="h-9 w-full sm:w-56 rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 text-[13px] outline-none focus:border-[#2d628e]"
          />
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-[7px] bg-[#17324e] px-3.5 text-[13px] font-semibold text-white hover:bg-[#285275]"
          >
            <Plus className="size-3.5" />
            Create license
          </button>
        </div>
      </div>

      {loadError && (
        <p className="rounded-[9px] border border-[#8b3133]/20 bg-[#faeeee] px-3.5 py-2.5 text-[13px] text-[#8b3133]">{loadError}</p>
      )}

      {isLoading && plans.length === 0 ? (
        <p className="rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-10 text-center text-[13px] text-[var(--text-muted)]">
          Loading licenses…
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-12 text-center">
          <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            {query ? 'No licenses match that search.' : 'No licenses yet.'}
          </p>
          {!query && (
            <button type="button" onClick={openCreate} className="mt-4 text-[13px] font-semibold text-[#2d628e]">
              Create the first license
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-surface)]">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-[12px] font-semibold text-[var(--text-secondary)]">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">License</th>
                <th className="px-3.5 py-2.5 font-semibold">Pricing</th>
                <th className="px-3.5 py-2.5 font-semibold">Seats</th>
                <th className="px-3.5 py-2.5 font-semibold">Status</th>
                <th className="px-3.5 py-2.5 font-semibold">Workspaces</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((plan) => {
                const enrolled = workspacesFor(plan);
                const open = expandedId === plan.id;
                return (
                  <React.Fragment key={plan.id}>
                    <tr className="border-b border-[var(--border-color)] last:border-0">
                      <td className="px-3.5 py-3 align-top">
                        <button type="button" className="text-left" onClick={() => setExpandedId(open ? null : plan.id)}>
                          <div className="font-semibold text-[var(--text-primary)]">{plan.name}</div>
                          <div className="text-[12px] text-[var(--text-muted)]">{plan.key}</div>
                        </button>
                      </td>
                      <td className="px-3.5 py-3 align-top tabular-nums text-[var(--text-secondary)]">
                        ${plan.price}/mo
                        {plan.priceAnnual ? ` · $${plan.priceAnnual}/yr` : ''}
                        {plan.trialDays ? ` · ${plan.trialDays}-day trial` : ''}
                      </td>
                      <td className="px-3.5 py-3 align-top tabular-nums">{plan.maxSeats}</td>
                      <td className="px-3.5 py-3 align-top">
                        <div className="text-[var(--text-primary)]">{plan.isActive === false ? 'Inactive' : 'Active'}</div>
                        <div className="text-[12px] text-[var(--text-muted)]">
                          {plan.isPublic === false ? 'Hidden from signup' : 'Shown on signup'}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 align-top tabular-nums">{plan.activeClientsCount}</td>
                      <td className="px-3.5 py-3 align-top">
                        <div className="flex justify-end gap-3 text-[12px] font-semibold">
                          <button type="button" className="text-[#2d628e]" onClick={() => openEdit(plan)}>
                            Edit
                          </button>
                          {plan.isActive === false ? (
                            <button
                              type="button"
                              disabled={busyId === plan.id}
                              className="text-[#53886b] disabled:opacity-50"
                              onClick={() => reactivate(plan)}
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === plan.id}
                              className="text-[#8b3133] disabled:opacity-50"
                              onClick={() => setPendingDelete(plan)}
                            >
                              {plan.activeClientsCount > 0 ? 'Deactivate' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-[var(--border-color)] bg-[var(--bg-surface-subtle)]">
                        <td colSpan={6} className="px-3.5 py-3.5">
                          {plan.description && <p className="mb-2.5 text-[13px] text-[var(--text-secondary)]">{plan.description}</p>}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-muted)]">
                            <span>Sort {plan.sortOrder ?? 100}</span>
                            {plan.features.map((feature) => (
                              <span key={feature} className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
                                <Check className="size-3 text-[#53886b]" />
                                {feature}
                              </span>
                            ))}
                          </div>
                          {enrolled.length > 0 && (
                            <ul className="mt-3 space-y-1 text-[12px] text-[var(--text-secondary)]">
                              {enrolled.map((tenant) => (
                                <li key={tenant.id}>
                                  {tenant.name} · {tenant.licenseStatus || tenant.status}
                                  {tenant.maxSeats ? ` · ${tenant.activeUsersCount}/${tenant.maxSeats} seats` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setShowEditor(false)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-surface)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold tracking-[-0.02em]">{editing ? 'Edit license' : 'Create license'}</h3>
              <button type="button" className="grid size-7 place-items-center rounded-full bg-[var(--bg-surface-subtle)]" onClick={() => setShowEditor(false)}>
                <X className="size-3.5" />
              </button>
            </div>
            <form onSubmit={persist} className="space-y-3 text-[13px]">
              <label className="block font-semibold text-[var(--text-secondary)]">
                Name
                <input
                  required
                  value={draft.name}
                  onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value, key: editing ? current.key : slugifyKey(e.target.value) }))}
                  className="mt-1 h-9 w-full rounded-[7px] border border-[var(--border-color)] px-3 font-medium outline-none focus:border-[#2d628e]"
                />
              </label>
              <label className="block font-semibold text-[var(--text-secondary)]">
                Key
                <input
                  value={draft.key}
                  disabled={Boolean(editing)}
                  onChange={(e) => setDraft((current) => ({ ...current, key: slugifyKey(e.target.value) }))}
                  className="mt-1 h-9 w-full rounded-[7px] border border-[var(--border-color)] px-3 font-medium outline-none focus:border-[#2d628e] disabled:bg-[var(--bg-surface-subtle)]"
                />
              </label>
              <label className="block font-semibold text-[var(--text-secondary)]">
                Description
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-[7px] border border-[var(--border-color)] px-3 py-2 font-medium outline-none focus:border-[#2d628e]"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block font-semibold text-[var(--text-secondary)]">
                  Price / month
                  <input type="number" min={0} value={draft.price} onChange={(e) => setDraft((current) => ({ ...current, price: Number(e.target.value) }))} className="mt-1 h-9 w-full rounded-[7px] border border-[var(--border-color)] px-3 font-medium outline-none focus:border-[#2d628e]" />
                </label>
                <label className="block font-semibold text-[var(--text-secondary)]">
                  Price / year
                  <input type="number" min={0} value={draft.priceAnnual} onChange={(e) => setDraft((current) => ({ ...current, priceAnnual: Number(e.target.value) }))} className="mt-1 h-9 w-full rounded-[7px] border border-[var(--border-color)] px-3 font-medium outline-none focus:border-[#2d628e]" />
                </label>
                <label className="block font-semibold text-[var(--text-secondary)]">
                  Seat limit
                  <input type="number" min={1} value={draft.seats} onChange={(e) => setDraft((current) => ({ ...current, seats: Number(e.target.value) }))} className="mt-1 h-9 w-full rounded-[7px] border border-[var(--border-color)] px-3 font-medium outline-none focus:border-[#2d628e]" />
                </label>
                <label className="block font-semibold text-[var(--text-secondary)]">
                  Trial days
                  <input type="number" min={0} value={draft.trialDays} onChange={(e) => setDraft((current) => ({ ...current, trialDays: Number(e.target.value) }))} className="mt-1 h-9 w-full rounded-[7px] border border-[var(--border-color)] px-3 font-medium outline-none focus:border-[#2d628e]" />
                </label>
                <label className="block font-semibold text-[var(--text-secondary)]">
                  Sort order
                  <input type="number" value={draft.sortOrder} onChange={(e) => setDraft((current) => ({ ...current, sortOrder: Number(e.target.value) }))} className="mt-1 h-9 w-full rounded-[7px] border border-[var(--border-color)] px-3 font-medium outline-none focus:border-[#2d628e]" />
                </label>
              </div>
              <label className="block font-semibold text-[var(--text-secondary)]">
                Features (one per line)
                <textarea
                  value={draft.features}
                  onChange={(e) => setDraft((current) => ({ ...current, features: e.target.value }))}
                  rows={4}
                  className="mt-1 w-full rounded-[7px] border border-[var(--border-color)] px-3 py-2 font-medium outline-none focus:border-[#2d628e]"
                />
              </label>
              <label className="flex items-center gap-2 text-[var(--text-secondary)]">
                <input type="checkbox" checked={draft.isPublic} onChange={(e) => setDraft((current) => ({ ...current, isPublic: e.target.checked }))} />
                Show on signup
              </label>
              <label className="flex items-center gap-2 text-[var(--text-secondary)]">
                <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((current) => ({ ...current, isActive: e.target.checked }))} />
                Active
              </label>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowEditor(false)} className="h-9 flex-1 rounded-[7px] border border-[var(--border-color)] font-medium text-[var(--text-secondary)]">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="h-9 flex-1 rounded-[7px] bg-[#17324e] font-semibold text-white disabled:opacity-50">
                  {saving ? 'Saving…' : editing ? 'Save license' : 'Create license'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setPendingDelete(null)}>
          <div className="w-full max-w-sm rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-surface)] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold tracking-[-0.02em]">
              {pendingDelete.activeClientsCount > 0 ? 'Deactivate this license?' : 'Delete this license?'}
            </h3>
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
              {pendingDelete.activeClientsCount > 0
                ? `${pendingDelete.name} is used by ${pendingDelete.activeClientsCount} workspace${pendingDelete.activeClientsCount === 1 ? '' : 's'}. It will be hidden from signup, not removed.`
                : `${pendingDelete.name} is not assigned to a workspace and will be removed.`}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setPendingDelete(null)} className="h-9 flex-1 rounded-[7px] border border-[var(--border-color)] text-[13px] font-medium">
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === pendingDelete.id}
                onClick={() => deactivate(pendingDelete)}
                className="h-9 flex-1 rounded-[7px] bg-[#8b3133] text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {pendingDelete.activeClientsCount > 0 ? 'Deactivate' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
