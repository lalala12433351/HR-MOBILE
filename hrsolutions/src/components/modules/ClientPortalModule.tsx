'use client';

import React, { useState } from 'react';
import { AppState } from '@/services/store';
import {
  ExternalLink,
  Briefcase,
  CheckCircle2,
  Clock,
  Receipt,
  FileText,
  Headphones,
  Calendar,
  Send,
  Download,
  Building2,
} from 'lucide-react';

interface ClientPortalModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const ClientPortalModule: React.FC<ClientPortalModuleProps> = ({ state, onUpdateState }) => {
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketSent, setTicketSent] = useState(false);

  const activeProjects = state.projects.slice(0, 2);
  const clientInvoices = state.invoices.slice(0, 3);

  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject || !ticketMessage) return;

    onUpdateState((prev) => ({
      ...prev,
      tickets: [
        {
          id: `tkt_${Date.now()}`,
          ticketNumber: `HD-${Math.floor(1000 + Math.random() * 9000)}`,
          customerName: state.currentPersona.name || 'Enterprise Client',
          customerEmail: state.currentPersona.email || 'client@acme.com',
          subject: ticketSubject,
          description: ticketMessage,
          priority: 'High',
          status: 'Open',
          category: 'Technical',
          createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
          slaHoursRemaining: 4,
        },
        ...prev.tickets,
      ],
    }));

    setTicketSubject('');
    setTicketMessage('');
    setTicketSent(true);
    setTimeout(() => setTicketSent(false), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <ExternalLink className="h-6 w-6 text-[#7c5cfc]" /> Client External Portal & Deliverables
          </h2>
          <p className="text-xs text-[#8e9eb5]">
            Dedicated customer collaboration workspace • Real-time project milestones, invoicing & SLA ticketing
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#161d2e] border border-[#232d44] text-xs">
          <Building2 className="h-4 w-4 text-[#7c5cfc]" />
          <span className="text-[#8e9eb5]">Active Account:</span>
          <span className="font-bold text-white">{state.customers[0]?.companyName || state.organization.name}</span>
        </div>
      </div>

      {/* Projects Progress Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {activeProjects.length === 0 ? (
          <div className="col-span-full p-8 rounded-2xl bg-[#161d2e] border border-[#232d44] text-center text-xs text-[#8e9eb5]">
            No active deliverables or client projects recorded yet.
          </div>
        ) : (
          activeProjects.map((proj) => (
            <div key={proj.id} className="p-6 rounded-2xl bg-[#161d2e] border border-[#232d44] space-y-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#7c5cfc]/20 text-[#a78bfa] font-bold text-[10px]">
                    {proj.category || 'Client Engagement'}
                  </span>
                  <h3 className="text-base font-bold text-white mt-1.5">{proj.name}</h3>
                  <p className="text-xs text-[#8e9eb5]">{proj.description}</p>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[#2dd4bf]/20 text-[#2dd4bf] font-bold text-[10px]">
                  {proj.status}
                </span>
              </div>

              <div className="space-y-2 pt-2 border-t border-[#232d44]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#8e9eb5]">Milestone Progress</span>
                  <span className="font-bold text-white">{proj.progress}%</span>
                </div>
                <div className="h-2 w-full bg-[#131929] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-[#7c5cfc] to-[#38bdf8] rounded-full"
                    style={{ width: `${proj.progress}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-[#8e9eb5] pt-1">
                <span>Target Delivery: <strong className="text-white">{proj.endDate}</strong></span>
                <span>Lead: <strong className="text-[#a78bfa]">{proj.managerName}</strong></span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Invoices & Support Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="p-6 rounded-2xl bg-[#161d2e] border border-[#232d44] space-y-4 shadow-sm">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Receipt className="h-4 w-4 text-[#2dd4bf]" /> Billed Deliverables & Invoices
          </h3>

          {clientInvoices.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8e9eb5]">
              No billed client invoices on file.
            </div>
          ) : (
            <div className="divide-y divide-[#232d44]">
              {clientInvoices.map((inv) => (
                <div key={inv.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-white">{inv.invoiceNumber}</p>
                    <p className="text-[11px] text-[#8e9eb5]">Due: {inv.dueDate}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="font-bold text-white">₹{inv.totalAmount.toLocaleString('en-IN')}</p>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        inv.status === 'Paid'
                          ? 'bg-[#2dd4bf]/20 text-[#2dd4bf]'
                          : 'bg-[#fb923c]/20 text-[#fb923c]'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Client Support Ticket Box */}
        <div className="p-6 rounded-2xl bg-[#161d2e] border border-[#232d44] space-y-4 shadow-sm">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Headphones className="h-4 w-4 text-[#38bdf8]" /> Submit Client Support Ticket
          </h3>

          {ticketSent && (
            <div className="p-3 bg-[#2dd4bf]/20 border border-[#2dd4bf]/40 rounded-xl text-xs text-[#2dd4bf] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Support request logged! Our engineering lead will respond within 4 hours.
            </div>
          )}

          <form onSubmit={handleSubmitTicket} className="space-y-3 text-xs">
            <div>
              <label className="block text-[#8e9eb5] font-semibold mb-1">Issue Subject</label>
              <input
                type="text"
                required
                placeholder="e.g. Inquire on Staging Milestone Deploy"
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                className="w-full p-2.5 bg-[#131929] border border-[#232d44] rounded-xl text-white focus:outline-none focus:border-[#7c5cfc]"
              />
            </div>
            <div>
              <label className="block text-[#8e9eb5] font-semibold mb-1">Detailed Message / Request</label>
              <textarea
                required
                rows={3}
                placeholder="Provide context or requested deliverables..."
                value={ticketMessage}
                onChange={(e) => setTicketMessage(e.target.value)}
                className="w-full p-2.5 bg-[#131929] border border-[#232d44] rounded-xl text-white focus:outline-none focus:border-[#7c5cfc]"
              />
            </div>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#7c5cfc] hover:bg-[#6b47fc] text-white font-bold rounded-xl shadow-md transition-all"
            >
              <Send className="h-4 w-4" /> Submit Support Request
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
