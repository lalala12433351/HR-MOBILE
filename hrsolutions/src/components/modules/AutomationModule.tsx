'use client';

import React, { useState } from 'react';
import { AppState } from '@/services/store';
import { WorkflowRule } from '@/types';
import {
  Zap,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Sparkles,
  Sliders,
  Settings,
  Bell,
  Mail,
  Shield,
} from 'lucide-react';

interface AutomationModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const AutomationModule: React.FC<AutomationModuleProps> = ({ state, onUpdateState }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRule, setNewRule] = useState({
    title: '',
    triggerEvent: 'TASK_COMPLETED',
    actionType: 'SEND_NOTIFICATION',
    description: '',
  });

  const handleToggleRule = (id: string) => {
    onUpdateState((prev) => ({
      ...prev,
      workflows: prev.workflows.map((w) =>
        w.id === id ? { ...w, enabled: !w.enabled } : w
      ),
    }));
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.title) return;

    const ruleToAdd: WorkflowRule = {
      id: `wf_${Date.now()}`,
      title: newRule.title,
      triggerEvent: newRule.triggerEvent,
      actionType: newRule.actionType,
      enabled: true,
      description: newRule.description || `Automatically execute ${newRule.actionType} on ${newRule.triggerEvent}`,
      executionCount: 0,
      lastTriggered: 'Never',
    };

    onUpdateState((prev) => ({
      ...prev,
      workflows: [ruleToAdd, ...prev.workflows],
    }));

    setNewRule({
      title: '',
      triggerEvent: 'TASK_COMPLETED',
      actionType: 'SEND_NOTIFICATION',
      description: '',
    });
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Zap className="h-6 w-6 text-[#7c5cfc]" /> Automation Engine & Workflows
          </h2>
          <p className="text-xs text-[#8e9eb5]">
            Configure trigger-action automations, cross-module hooks, and Gemini AI background workers
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#7c5cfc] hover:bg-[#6b47fc] text-white text-xs font-bold rounded-lg shadow-lg shadow-[#7c5cfc]/25 transition-all active:scale-95 self-start md:self-auto"
        >
          <Plus className="h-4 w-4" /> Create Workflow Rule
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-[#161d2e] border border-[#232d44] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[#8e9eb5] uppercase tracking-wider">Active Rules</span>
            <div className="p-2 bg-[#7c5cfc]/20 text-[#a78bfa] rounded-lg">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-white tabular-nums">{state.workflows.filter((w) => w.enabled).length}</p>
          <p className="text-[11px] text-[#2dd4bf] mt-1 font-medium">Out of {state.workflows.length} total rules</p>
        </div>

        <div className="p-5 rounded-xl bg-[#161d2e] border border-[#232d44] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[#8e9eb5] uppercase tracking-wider">Automations Fired</span>
            <div className="p-2 bg-[#2dd4bf]/20 text-[#2dd4bf] rounded-lg">
              <Play className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-[#2dd4bf] tabular-nums">
            {state.workflows.reduce((acc, w) => acc + (w.executionCount || 0), 0)}
          </p>
          <p className="text-[11px] text-[#8e9eb5] mt-1 font-medium">99.8% successful execution SLA</p>
        </div>

        <div className="p-5 rounded-xl bg-[#161d2e] border border-[#232d44] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[#8e9eb5] uppercase tracking-wider">Estimated Time Saved</span>
            <div className="p-2 bg-[#38bdf8]/20 text-[#38bdf8] rounded-lg">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-white tabular-nums">
            {(state.workflows.reduce((acc, w) => acc + (w.executionCount || 0), 0) * 0.25).toFixed(1)} hrs / mo
          </p>
          <p className="text-[11px] text-[#38bdf8] mt-1 font-medium">Operational labor automated</p>
        </div>
      </div>

      {/* Rules List */}
      <div className="rounded-xl border border-[#232d44] bg-[#161d2e] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#232d44] flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Enterprise Workflow Engine</h3>
          <span className="text-xs font-semibold text-[#a78bfa]">{state.workflows.length} Configured Rules</span>
        </div>

        <div className="divide-y divide-[#232d44]">
          {state.workflows.map((rule) => (
            <div
              key={rule.id}
              className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#1c2438] transition-colors"
            >
              <div className="space-y-2 max-w-xl">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      rule.enabled ? 'bg-[#2dd4bf] animate-pulse' : 'bg-[#596b84]'
                    }`}
                  />
                  <h4 className="text-sm font-bold text-white">{rule.title}</h4>
                </div>
                <p className="text-xs text-[#8e9eb5] leading-relaxed">{rule.description}</p>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                  <span className="px-2.5 py-0.5 rounded-md bg-[#131929] border border-[#232d44] text-[#a78bfa] font-mono font-semibold">
                    WHEN: {rule.triggerEvent}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#596b84]" />
                  <span className="px-2.5 py-0.5 rounded-md bg-[#131929] border border-[#232d44] text-[#2dd4bf] font-mono font-semibold">
                    THEN: {rule.actionType}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 self-end md:self-center">
                <div className="text-right text-xs">
                  <p className="text-[10px] text-[#596b84] uppercase tracking-wider font-semibold">Executed</p>
                  <p className="font-bold text-white">{rule.executionCount || 0} times</p>
                </div>

                {/* Toggle switch */}
                <button
                  onClick={() => handleToggleRule(rule.id)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ${
                    rule.enabled ? 'bg-[#7c5cfc]' : 'bg-[#232d44]'
                  }`}
                >
                  <div
                    className={`bg-[var(--bg-surface)] w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                      rule.enabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md rounded-xl bg-[#161d2e] border border-[#232d44] p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#232d44] pb-3">
              <h3 className="text-sm font-bold text-white">Create New Automation Workflow</h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#8e9eb5]">✕</button>
            </div>
            <form onSubmit={handleCreateRule} className="space-y-3">
              <div>
                <label className="block text-[#8e9eb5] font-semibold mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Auto-Notify Team on Critical Bug"
                  value={newRule.title}
                  onChange={(e) => setNewRule({ ...newRule, title: e.target.value })}
                  className="w-full p-2.5 bg-[#131929] border border-[#232d44] rounded-lg text-white focus:outline-none focus:border-[#7c5cfc]"
                />
              </div>

              <div>
                <label className="block text-[#8e9eb5] font-semibold mb-1">Trigger Event</label>
                <select
                  value={newRule.triggerEvent}
                  onChange={(e) => setNewRule({ ...newRule, triggerEvent: e.target.value })}
                  className="w-full p-2.5 bg-[#131929] border border-[#232d44] rounded-lg text-white focus:outline-none focus:border-[#7c5cfc]"
                >
                  <option value="TASK_COMPLETED">Task Marked as Completed</option>
                  <option value="NEW_LEAD_CREATED">New CRM Lead Form Submission</option>
                  <option value="EXPENSE_SUBMITTED">Employee Expense Claim Filed</option>
                  <option value="TICKET_ESCALATED">Support Ticket SLA Breach Warning</option>
                  <option value="INVOICE_OVERDUE">GST Invoice Past Due Date</option>
                </select>
              </div>

              <div>
                <label className="block text-[#8e9eb5] font-semibold mb-1">Action to Execute</label>
                <select
                  value={newRule.actionType}
                  onChange={(e) => setNewRule({ ...newRule, actionType: e.target.value })}
                  className="w-full p-2.5 bg-[#131929] border border-[#232d44] rounded-lg text-white focus:outline-none focus:border-[#7c5cfc]"
                >
                  <option value="SEND_NOTIFICATION">Push Real-Time Notification & Toast</option>
                  <option value="AI_GENERATE_SUMMARY">Trigger Gemini AI Executive Brief</option>
                  <option value="EMAIL_DISPATCH">Send Automated Email via Gmail API</option>
                  <option value="AUDIT_LOG_ENTRY">Record High-Priority Audit Log</option>
                </select>
              </div>

              <div>
                <label className="block text-[#8e9eb5] font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Describe the workflow purpose..."
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  className="w-full p-2.5 bg-[#131929] border border-[#232d44] rounded-lg text-white focus:outline-none focus:border-[#7c5cfc]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#232d44]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 bg-[#131929] border border-[#232d44] text-[#8e9eb5] rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#7c5cfc] hover:bg-[#6b47fc] text-white rounded-lg font-bold shadow-md"
                >
                  Save & Enable Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
