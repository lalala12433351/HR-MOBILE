'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/services/apiClient';
import { AppState } from '@/services/store';
import { BillingClient } from '@/types';
import { PayrollHeaderSwitch } from './PayrollHeaderSwitch';

type InnerTab = 'clients' | 'unbilled' | 'invoices';

type UnbilledLine = {
  kind: 'hourly' | 'deliverable';
  sourceTaskId?: string | null;
  sourceTimesheetId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  date?: string;
  projectId?: string;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  included?: boolean;
};

const controlClass =
  'h-10 rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 text-sm font-semibold text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[#2d628e] focus-visible:ring-offset-1';
const primaryBtn =
  'inline-flex h-10 items-center justify-center rounded-[7px] bg-[#17324e] px-4 text-sm font-semibold text-white hover:bg-[#285275] disabled:opacity-50';
const secondaryBtn =
  'inline-flex h-10 items-center justify-center rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[#f8fbfe]';

const money = (value: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value) || 0);

function mapClient(row: any): BillingClient {
  return {
    id: String(row.id),
    name: row.name || '',
    companyName: row.company_name || row.companyName || row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    billingAddress: row.billing_address || row.billingAddress || '',
    gstin: row.gstin || '',
    currency: row.currency || 'INR',
    paymentTermsDays: Number(row.payment_terms_days ?? row.paymentTermsDays ?? 15) || 15,
    defaultHourlyRate: row.default_hourly_rate != null ? Number(row.default_hourly_rate) : row.defaultHourlyRate != null ? Number(row.defaultHourlyRate) : null,
    notes: row.notes || '',
    status: String(row.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
    projectCount: Number(row.project_count ?? row.projectCount ?? 0) || 0,
  };
}

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

function emptyClientForm() {
  return {
    name: '',
    companyName: '',
    email: '',
    phone: '',
    billingAddress: '',
    gstin: '',
    currency: 'INR',
    paymentTermsDays: '15',
    defaultHourlyRate: '',
    notes: '',
  };
}

export function PayrollBillableModule({ state }: { state: AppState }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as InnerTab | null;
  const invoiceIdParam = searchParams.get('id');
  const innerTab: InnerTab = tabParam === 'unbilled' || tabParam === 'invoices' || tabParam === 'clients' ? tabParam : 'clients';

  const now = new Date();
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [lines, setLines] = useState<UnbilledLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyClientForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [invoiceKind, setInvoiceKind] = useState<'monthly' | 'project'>('monthly');
  const [detail, setDetail] = useState<any | null>(null);
  const [projects, setProjects] = useState(state.projects || []);

  const setTab = (tab: InnerTab, invoiceId?: string) => {
    const params = new URLSearchParams();
    params.set('tab', tab);
    if (invoiceId) params.set('id', invoiceId);
    router.replace(`/payroll/billable?${params.toString()}`);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    const range = monthRange(year, month);
    const [clientRes, unbilledRes, invoiceRes, projectRes] = await Promise.all([
      api.billing.getClients(),
      api.billing.getUnbilled({
        clientId: clientFilter || undefined,
        projectId: projectFilter || undefined,
        from: range.start,
        to: range.end,
      }),
      api.billing.getInvoices(),
      api.projects.getProjects(),
    ]);
    if (clientRes.success && Array.isArray(clientRes.data)) setClients(clientRes.data.map(mapClient));
    if (unbilledRes.success && unbilledRes.data?.lines) {
      setLines((unbilledRes.data.lines as UnbilledLine[]).map((line) => ({ ...line, included: true })));
    } else {
      setLines([]);
    }
    if (invoiceRes.success && Array.isArray(invoiceRes.data)) setInvoices(invoiceRes.data);
    if (projectRes.success && Array.isArray(projectRes.data)) {
      setProjects(
        projectRes.data.map((p: any) => ({
          id: String(p.id),
          name: p.name,
          code: p.code || '',
          clientName: p.client_name || p.clientName || '',
          clientId: p.client_id || p.clientId,
          description: p.description || '',
          managerId: p.manager_id || '',
          managerName: p.manager_name || '',
          teamMembers: [],
          startDate: p.start_date || '',
          endDate: p.end_date || '',
          currency: p.currency || 'INR',
          status: 'In Progress',
          priority: 'Medium',
          progress: 0,
        }))
      );
    }
    setLoading(false);
  }, [clientFilter, projectFilter, month, year]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!invoiceIdParam) {
      setDetail(null);
      return;
    }
    void api.billing.getInvoice(invoiceIdParam).then((res) => {
      if (res.success) setDetail(res.data);
    });
  }, [invoiceIdParam]);

  const selected = lines.filter((line) => line.included);
  const selectedSubtotal = selected.reduce((sum, line) => sum + Number(line.total || line.quantity * line.unitPrice), 0);
  const selectedGst = selectedSubtotal * 0.18;
  const invoiceClientId = clientFilter || selected[0]?.clientId || '';

  const startEdit = (client: BillingClient) => {
    setEditingId(client.id);
    setForm({
      name: client.name,
      companyName: client.companyName || '',
      email: client.email || '',
      phone: client.phone || '',
      billingAddress: client.billingAddress || '',
      gstin: client.gstin || '',
      currency: client.currency || 'INR',
      paymentTermsDays: String(client.paymentTermsDays || 15),
      defaultHourlyRate: client.defaultHourlyRate != null ? String(client.defaultHourlyRate) : '',
      notes: client.notes || '',
    });
  };

  const saveClient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error('Enter a client name.');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      companyName: form.companyName.trim() || form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      billingAddress: form.billingAddress.trim(),
      gstin: form.gstin.trim(),
      currency: form.currency || 'INR',
      paymentTermsDays: Number(form.paymentTermsDays) || 15,
      defaultHourlyRate: form.defaultHourlyRate === '' ? null : Number(form.defaultHourlyRate),
      notes: form.notes.trim(),
    };
    const res = editingId
      ? await api.billing.updateClient(editingId, payload)
      : await api.billing.createClient(payload);
    setSaving(false);
    if (!res.success) {
      toast.error(res.error?.message || 'Could not save the client.');
      return;
    }
    toast.success(editingId ? 'Client updated.' : 'Client created.');
    setForm(emptyClientForm());
    setEditingId(null);
    void loadAll();
  };

  const createInvoice = async () => {
    if (!invoiceClientId) {
      toast.error('Select a client before creating an invoice.');
      return;
    }
    if (!selected.length) {
      toast.error('Select at least one unbilled line.');
      return;
    }
    if (invoiceKind === 'project' && !projectFilter) {
      toast.error('Pick a project for a project invoice.');
      return;
    }
    const mixed = selected.some((line) => line.clientId && line.clientId !== invoiceClientId);
    if (mixed) {
      toast.error('Selected lines belong to more than one client. Filter by client first.');
      return;
    }
    setSaving(true);
    const range = monthRange(year, month);
    const res = await api.billing.createInvoice({
      clientId: invoiceClientId,
      kind: invoiceKind,
      projectId: invoiceKind === 'project' ? projectFilter : undefined,
      periodStart: range.start,
      periodEnd: range.end,
      lines: selected.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity) || 0,
        unitPrice: Number(line.unitPrice) || 0,
        sourceTaskId: line.sourceTaskId || undefined,
        sourceTimesheetId: line.sourceTimesheetId || undefined,
      })),
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.error?.message || 'Could not create the invoice.');
      return;
    }
    toast.success(`Draft ${res.data?.invoice_number || 'invoice'} created.`);
    setTab('invoices', res.data?.id);
    void loadAll();
  };

  const markStatus = async (id: string, status: string) => {
    const res = await api.billing.updateInvoice(id, { status });
    if (!res.success) {
      toast.error(res.error?.message || 'Could not update the invoice.');
      return;
    }
    toast.success(`Invoice marked ${status}.`);
    void loadAll();
    if (detail?.id === id) {
      const fresh = await api.billing.getInvoice(id);
      if (fresh.success) setDetail(fresh.data);
    }
  };

  const deleteUnbilledTask = async (line: UnbilledLine) => {
    const taskId = String(line.sourceTaskId || '').trim();
    if (!taskId || line.kind !== 'deliverable') return;
    if (!window.confirm(`Delete unbilled task “${line.description}”? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await api.projects.deleteTask(taskId);
      if (!res.success) {
        toast.error(res.error?.message || 'Could not delete the task.');
        return;
      }
      toast.success('Unbilled task deleted.');
      setLines((prev) => prev.filter((row) => row.sourceTaskId !== taskId));
      void loadAll();
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete the task.');
    } finally {
      setSaving(false);
    }
  };

  const org = state.organization;
  const companyName = org?.name || 'Company';
  const companyAddress =
    [
      org?.streetAddress,
      [org?.city, org?.stateProvince].filter(Boolean).join(', '),
      org?.postalCode,
      org?.country,
    ]
      .filter(Boolean)
      .join('\n') ||
    String(org?.officeLocation?.address || '').trim() ||
    '';
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex shrink-0 flex-col gap-4 border-b border-[var(--border-color)] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <PayrollHeaderSwitch active="billable" />
          <p className="mt-1 max-w-[62ch] text-[14px] leading-6 text-[var(--text-secondary)]">
            Create clients, pull approved timesheets and completed tasks, then invoice monthly or by project.
          </p>
        </div>
      </header>

      <div className="work-tabs shrink-0 overflow-x-auto no-scrollbar">
        {([
          ['clients', 'Clients'],
          ['unbilled', 'Unbilled'],
          ['invoices', 'Invoices'],
        ] as Array<[InnerTab, string]>).map(([id, label]) => (
          <button key={id} type="button" className="work-tab" aria-selected={innerTab === id} onClick={() => setTab(id)}>
            {label}
            {id === 'unbilled' && lines.length > 0 && (
              <span className={`work-chip ${innerTab === 'unbilled' ? 'work-chip-navy' : 'work-chip-muted'}`}>{lines.length}</span>
            )}
          </button>
        ))}
      </div>

      {innerTab === 'clients' && (
        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-h-0 overflow-auto rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#f8fbfe] text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Rate</th>
                  <th className="px-4 py-3">Terms</th>
                  <th className="px-4 py-3">Projects</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-secondary)]">
                      No clients yet. Add one to start billing project work.
                    </td>
                  </tr>
                )}
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className="cursor-pointer border-t border-[var(--border-color)] hover:bg-[#f8fbfe]"
                    onClick={() => startEdit(client)}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-[var(--text-primary)]">{client.companyName || client.name}</div>
                      <div className="text-[12px] text-[var(--text-muted)]">{client.name}</div>
                    </td>
                    <td className="px-4 py-3.5 text-[var(--text-secondary)]">{client.email || '—'}</td>
                    <td className="px-4 py-3.5 tabular-nums">{client.defaultHourlyRate ? money(client.defaultHourlyRate, client.currency) : '—'}</td>
                    <td className="px-4 py-3.5">{client.paymentTermsDays} days</td>
                    <td className="px-4 py-3.5">{client.projectCount || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={saveClient} className="space-y-2 rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] p-3">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">{editingId ? 'Edit client' : 'New client'}</h2>
            <input className={`${controlClass} w-full font-normal`} placeholder="Client name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={`${controlClass} w-full font-normal`} placeholder="Company" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            <input className={`${controlClass} w-full font-normal`} placeholder="Billing email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className={`${controlClass} w-full font-normal`} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <textarea className="min-h-[4.5rem] w-full rounded-[7px] border border-[var(--border-color)] px-4 py-3 text-xs" placeholder="Billing address" value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} />
            <input className={`${controlClass} w-full font-normal`} placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className={`${controlClass} w-full font-normal`} placeholder="Terms (days)" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} />
              <input className={`${controlClass} w-full font-normal`} placeholder="Hourly rate" value={form.defaultHourlyRate} onChange={(e) => setForm({ ...form, defaultHourlyRate: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className={primaryBtn}>{editingId ? 'Save client' : 'Create client'}</button>
              {editingId && (
                <button type="button" className={secondaryBtn} onClick={() => { setEditingId(null); setForm(emptyClientForm()); }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {innerTab === 'unbilled' && (
        <div className="flex min-h-0 flex-1 flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={controlClass} aria-label="Client">
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.companyName || client.name}</option>
              ))}
            </select>
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className={controlClass} aria-label="Project">
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={controlClass} aria-label="Month">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((value) => (
                <option key={value} value={value}>{new Date(2026, value - 1, 1).toLocaleDateString('en-IN', { month: 'long' })}</option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={controlClass} aria-label="Year">
              {years.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select value={invoiceKind} onChange={(e) => setInvoiceKind(e.target.value as 'monthly' | 'project')} className={controlClass} aria-label="Invoice type">
              <option value="monthly">Monthly invoice</option>
              <option value="project">Project invoice</option>
            </select>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#f8fbfe] text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Work</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Rate</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[var(--text-secondary)]">
                      No unbilled work in this period. Complete billable tasks or approve timesheets first.
                    </td>
                  </tr>
                )}
                {lines.map((line, index) => (
                  <tr key={`${line.sourceTaskId || line.sourceTimesheetId || index}`} className="border-t border-[var(--border-color)]">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(line.included)}
                        onChange={(e) => setLines((prev) => prev.map((row, i) => (i === index ? { ...row, included: e.target.checked } : row)))}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--text-primary)]">{line.description}</div>
                      <div className="text-[12px] text-[var(--text-muted)]">{line.clientName || 'No client'} · {line.date || ''}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{line.kind}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-8 w-20 rounded-[7px] border border-[var(--border-color)] px-2"
                        value={line.quantity}
                        onChange={(e) => {
                          const quantity = Number(e.target.value) || 0;
                          setLines((prev) => prev.map((row, i) => i === index ? { ...row, quantity, total: quantity * row.unitPrice } : row));
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-8 w-24 rounded-[7px] border border-[var(--border-color)] px-2"
                        value={line.unitPrice}
                        onChange={(e) => {
                          const unitPrice = Number(e.target.value) || 0;
                          setLines((prev) => prev.map((row, i) => i === index ? { ...row, unitPrice, total: row.quantity * unitPrice } : row));
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{money(line.total)}</td>
                    <td className="px-4 py-3 text-right">
                      {line.kind === 'deliverable' && line.sourceTaskId ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void deleteUnbilledTask(line)}
                          className="text-[12px] font-semibold text-[#9b2c2c] hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-3">
            <p className="text-xs text-[var(--text-secondary)]">
              {selected.length} lines · Subtotal {money(selectedSubtotal)} · GST 18% {money(selectedGst)} · Total {money(selectedSubtotal + selectedGst)}
            </p>
            <button type="button" disabled={saving || !selected.length} onClick={createInvoice} className={primaryBtn}>
              Create draft invoice
            </button>
          </div>
        </div>
      )}

      {innerTab === 'invoices' && !detail && (
        <div className="min-h-0 flex-1 overflow-auto rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#f8fbfe] text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-secondary)]">No invoices yet.</td>
                </tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id} className="cursor-pointer border-t border-[var(--border-color)] hover:bg-[#f8fbfe]" onClick={() => setTab('invoices', inv.id)}>
                  <td className="px-4 py-3.5 font-semibold">{inv.invoice_number}</td>
                  <td className="px-4 py-3.5">{inv.client_name || inv.customer_name || '—'}</td>
                  <td className="px-4 py-3.5 capitalize">{inv.kind || 'project'}</td>
                  <td className="px-4 py-3.5 tabular-nums">{money(Number(inv.total_amount) || 0)}</td>
                  <td className="px-4 py-3.5 capitalize">{String(inv.status || 'draft').replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {innerTab === 'invoices' && detail && (
        <InvoiceDocument
          invoice={detail}
          companyName={companyName}
          companyAddress={companyAddress}
          onBack={() => setTab('invoices')}
          onStatus={markStatus}
        />
      )}
    </div>
  );
}

function formatSellerAddress(invoice: any, fallback: string): string {
  const fromApi = String(invoice?.seller_address_formatted || '').trim();
  if (fromApi) return fromApi;
  const parts = [
    invoice?.seller_address,
    [invoice?.seller_city, invoice?.seller_state_province].filter(Boolean).join(', '),
    invoice?.seller_postal_code,
    invoice?.seller_country,
  ].filter(Boolean);
  if (parts.length) return parts.join('\n');
  return fallback;
}

function escapePrintHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Opens a clean print sheet so the browser does not stamp date/title/URL/page chrome. */
function printInvoicePdf(opts: {
  invoice: any;
  sellerName: string;
  sellerAddress: string;
  status: string;
  lines: any[];
}) {
  const { invoice, sellerName, sellerAddress, status, lines } = opts;
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=860,height=1100');
  if (!printWindow) {
    toast.error('Allow pop-ups to download the invoice PDF.');
    return;
  }

  const period =
    invoice.billing_period_start || invoice.issue_date
      ? `${String(invoice.billing_period_start || invoice.issue_date).slice(0, 10)} – ${String(invoice.billing_period_end || invoice.due_date || '').slice(0, 10)}`
      : '—';
  const billToName = String(invoice.company_name || invoice.client_name || invoice.customer_name || '').trim();
  const lineRows = lines
    .map(
      (line: any) => `
      <tr>
        <td>${escapePrintHtml(String(line.description || ''))}</td>
        <td class="num">${Number(line.quantity)}</td>
        <td class="num">${escapePrintHtml(money(Number(line.unit_price) || 0))}</td>
        <td class="num right">${escapePrintHtml(money(Number(line.total) || 0))}</td>
      </tr>`
    )
    .join('');

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>&nbsp;</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #172234;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    body { padding: 18mm 16mm; }
    header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #dde4e9; padding-bottom: 16px; }
    .eyebrow { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #5e6c7b; }
    h1 { margin: 6px 0 0; font-size: 22px; letter-spacing: -0.02em; }
    .muted { color: #5e6c7b; white-space: pre-line; }
    .meta { text-align: right; font-size: 13px; line-height: 1.5; }
    .meta strong { display: block; font-size: 14px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 18px; font-size: 13px; line-height: 1.5; }
    .right { text-align: right; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; color: #5e6c7b; border-bottom: 1px solid #dde4e9; padding: 8px 0; }
    td { border-bottom: 1px solid #f3f5f7; padding: 10px 0; vertical-align: top; }
    th.right, td.right { text-align: right; }
    .num { font-variant-numeric: tabular-nums; }
    .totals { width: 220px; margin: 18px 0 0 auto; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; }
    .totals .grand { margin-top: 6px; padding-top: 8px; border-top: 1px solid #dde4e9; font-weight: 700; }
    .terms { margin-top: 28px; font-size: 12px; color: #5e6c7b; }
  </style>
</head>
<body>
  <header>
    <div>
      <p class="eyebrow">Tax invoice</p>
      <h1>${escapePrintHtml(sellerName)}</h1>
      ${sellerAddress ? `<p class="muted" style="margin:8px 0 0;font-size:13px;">${escapePrintHtml(sellerAddress)}</p>` : ''}
    </div>
    <div class="meta">
      <strong>${escapePrintHtml(String(invoice.invoice_number || ''))}</strong>
      <div>Issued ${escapePrintHtml(String(invoice.issue_date || '').slice(0, 10))}</div>
      ${invoice.due_date ? `<div>Due ${escapePrintHtml(String(invoice.due_date).slice(0, 10))}</div>` : ''}
    </div>
  </header>
  <div class="grid">
    <div>
      <p class="eyebrow">Bill to</p>
      <div style="font-weight:600;margin-top:4px;">${escapePrintHtml(billToName)}</div>
      ${invoice.billing_address ? `<div class="muted">${escapePrintHtml(String(invoice.billing_address))}</div>` : ''}
      ${invoice.gstin ? `<div>GSTIN ${escapePrintHtml(String(invoice.gstin))}</div>` : ''}
      ${invoice.client_email ? `<div>${escapePrintHtml(String(invoice.client_email))}</div>` : ''}
    </div>
    <div class="right">
      <p class="eyebrow">Period</p>
      <div style="margin-top:4px;">${escapePrintHtml(period)}</div>
      <div style="text-transform:capitalize;">${escapePrintHtml(String(invoice.kind || 'project'))} billing</div>
      ${invoice.project_name ? `<div>${escapePrintHtml(String(invoice.project_name))}</div>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Rate</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${escapePrintHtml(money(Number(invoice.subtotal) || 0))}</span></div>
    <div><span>GST 18%</span><span>${escapePrintHtml(money(Number(invoice.gst_amount) || 0))}</span></div>
    <div class="grand"><span>Total</span><span>${escapePrintHtml(money(Number(invoice.total_amount) || 0))}</span></div>
  </div>
  <p class="terms">Payment terms: ${Number(invoice.payment_terms_days) || 15} days. Status: ${escapePrintHtml(status.replace('_', ' '))}.</p>
  <script>
    window.onload = function () {
      document.title = ' ';
      setTimeout(function () {
        window.focus();
        window.print();
      }, 150);
    };
    window.onafterprint = function () { window.close(); };
  </script>
</body>
</html>`);
  printWindow.document.close();
}

function InvoiceDocument({
  invoice,
  companyName,
  companyAddress,
  onBack,
  onStatus,
}: {
  invoice: any;
  companyName: string;
  companyAddress: string;
  onBack: () => void;
  onStatus: (id: string, status: string) => void;
}) {
  const status = String(invoice.status || 'draft').toLowerCase();
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const sellerName = String(invoice.seller_name || companyName).trim() || companyName;
  const sellerAddress = formatSellerAddress(invoice, companyAddress);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <button type="button" className={secondaryBtn} onClick={onBack}>Back to invoices</button>
        <div className="flex flex-wrap gap-2">
          {status === 'draft' && <button type="button" className={secondaryBtn} onClick={() => onStatus(invoice.id, 'sent')}>Mark sent</button>}
          {status !== 'paid' && <button type="button" className={secondaryBtn} onClick={() => onStatus(invoice.id, 'paid')}>Mark paid</button>}
          <button
            type="button"
            className={primaryBtn}
            onClick={() =>
              printInvoicePdf({
                invoice,
                sellerName,
                sellerAddress,
                status,
                lines,
              })
            }
          >
            Download PDF
          </button>
        </div>
      </div>
      <article className="invoice-print mx-auto w-full max-w-[720px] rounded-[12px] border border-[var(--border-color)] bg-white p-8 text-[#172234]">
        <header className="flex items-start justify-between gap-4 border-b border-[#dde4e9] pb-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#5e6c7b]">Tax invoice</p>
            <h2 className="mt-1 text-xl font-bold tracking-[-0.02em]">{sellerName}</h2>
            {sellerAddress ? (
              <p className="mt-1 whitespace-pre-line text-sm text-[#5e6c7b]">{sellerAddress}</p>
            ) : null}
          </div>
          <div className="text-right text-sm">
            <p className="font-bold">{invoice.invoice_number}</p>
            <p>Issued {String(invoice.issue_date || '').slice(0, 10)}</p>
            {invoice.due_date && <p>Due {String(invoice.due_date).slice(0, 10)}</p>}
          </div>
        </header>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[12px] font-bold uppercase text-[#5e6c7b]">Bill to</p>
            <p className="font-semibold">{invoice.company_name || invoice.client_name || invoice.customer_name}</p>
            {invoice.billing_address && <p className="whitespace-pre-line text-[#5e6c7b]">{invoice.billing_address}</p>}
            {invoice.gstin && <p>GSTIN {invoice.gstin}</p>}
            {invoice.client_email && <p>{invoice.client_email}</p>}
          </div>
          <div className="text-right">
            <p className="text-[12px] font-bold uppercase text-[#5e6c7b]">Period</p>
            <p>
              {invoice.billing_period_start || invoice.issue_date
                ? `${String(invoice.billing_period_start || invoice.issue_date).slice(0, 10)} – ${String(invoice.billing_period_end || invoice.due_date || '').slice(0, 10)}`
                : '—'}
            </p>
            <p className="capitalize">{invoice.kind || 'project'} billing</p>
            {invoice.project_name && <p>{invoice.project_name}</p>}
          </div>
        </div>
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#dde4e9] text-[12px] uppercase text-[#5e6c7b]">
              <th className="py-2 font-bold">Description</th>
              <th className="py-2 font-bold">Qty</th>
              <th className="py-2 font-bold">Rate</th>
              <th className="py-2 font-bold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line: any) => (
              <tr key={line.id} className="border-b border-[#f3f5f7]">
                <td className="py-2">{line.description}</td>
                <td className="py-2 tabular-nums">{Number(line.quantity)}</td>
                <td className="py-2 tabular-nums">{money(Number(line.unit_price) || 0)}</td>
                <td className="py-2 text-right tabular-nums">{money(Number(line.total) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 ml-auto w-56 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(Number(invoice.subtotal) || 0)}</span></div>
          <div className="flex justify-between"><span>GST 18%</span><span>{money(Number(invoice.gst_amount) || 0)}</span></div>
          <div className="mt-1 flex justify-between border-t border-[#dde4e9] pt-1 font-bold"><span>Total</span><span>{money(Number(invoice.total_amount) || 0)}</span></div>
        </div>
        <p className="mt-6 text-xs text-[#5e6c7b]">
          Payment terms: {invoice.payment_terms_days || 15} days. Status: {status.replace('_', ' ')}.
        </p>
      </article>
    </div>
  );
}
