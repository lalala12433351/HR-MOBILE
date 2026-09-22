'use client';

import React, { useState, useEffect } from 'react';
import { Bot, Send, Sparkles, X, RefreshCw, CheckCircle2, AlertTriangle, Lightbulb } from 'lucide-react';
import { AppState } from '../../services/store';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  initialQuery?: string;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  state,
  initialQuery = '',
}) => {
  const [prompt, setPrompt] = useState(initialQuery);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    {
      role: 'assistant',
      text: 'Hello! I am **Acme Intelligence**, your AI Executive Assistant. Ask me about tasks, attendance, P&L revenue, project bottlenecks, or request auto-generated reports and draft emails.',
    },
  ]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialQuery && initialQuery.trim().length > 0) {
      handleSendPrompt(initialQuery);
    }
  }, [initialQuery]);

  if (!isOpen) return null;

  const quickPrompts = [
    'What tasks are overdue or urgent?',
    'Which employees are absent or on leave today?',
    'Summarize current revenue and unpaid invoices',
    'Which projects are behind schedule?',
  ];

  const handleSendPrompt = async (queryToSend?: string) => {
    const activeQuery = queryToSend || prompt;
    if (!activeQuery.trim() || loading) return;

    const userMsg = { role: 'user' as const, text: activeQuery };
    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);

    try {
      // Build summary context of current business state for Gemini
      const businessContext = {
        organization: state.organization.name,
        totalEmployees: state.employees.length,
        attendanceToday: {
          present: state.attendance.filter((a) => a.status === 'Present' || a.status === 'Late').length,
          absent: state.attendance.filter((a) => a.status === 'Absent').length,
          onLeave: state.attendance.filter((a) => a.status === 'On Leave').length,
        },
        projectsCount: state.projects.length,
        tasksOverdue: state.tasks.filter((t) => t.status !== 'Completed' && new Date(t.dueDate) < new Date()).length,
        unpaidInvoicesSum: state.invoices
          .filter((i) => i.status !== 'Paid')
          .reduce((acc, i) => acc + (i.totalAmount - i.paidAmount), 0),
        activeLeads: state.leads.length,
      };

      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: activeQuery, context: businessContext }),
      });

      const data = await res.json();
      if (data.response) {
        setMessages((prev) => [...prev, { role: 'assistant', text: data.response }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: 'Error generating response: ' + (data.error || 'Unknown error') },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Failed to communicate with AI Assistant endpoint: ' + err.message },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] max-h-[620px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#282830] bg-[#121214] shadow-2xl cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#282830] bg-[#121214] px-4 sm:px-5 py-3.5 sm:py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-950/40 border border-blue-800/40 text-blue-400">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2 text-white">
                Acme Intelligence <span className="rounded-md bg-blue-950/40 border border-blue-800/40 px-1.5 py-0.5 text-[10px] font-mono text-blue-300">Gemini 3.6 Flash</span>
              </h2>
              <p className="text-[11px] text-[#9e9ea7]">AI Business Assistant & Workflow Automation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#9e9ea7] hover:bg-[#18181d] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Prompts Bar */}
        <div className="flex gap-2 border-b border-[#282830] bg-[#18181d] p-2.5 overflow-x-auto custom-scrollbar">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSendPrompt(qp)}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-[#282830] bg-[#121214] px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-blue-500 hover:text-white transition-all cursor-pointer"
            >
              <Lightbulb className="h-3 w-3 text-blue-400" />
              <span>{qp}</span>
            </button>
          ))}
        </div>

        {/* Message Conversation Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#121214] custom-scrollbar">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-xs ${
                  m.role === 'user'
                    ? 'bg-[#18181d] border border-[#282830] text-white'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {m.role === 'user' ? 'You' : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={`max-w-[82%] rounded-xl p-3.5 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#18181d] border border-[#282830] text-slate-200 whitespace-pre-wrap'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 p-3 text-xs text-blue-400 font-medium">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analyzing cross-departmental business data with Gemini AI...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="border-t border-[#282830] bg-[#121214] p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendPrompt();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask AI assistant about tasks, attendance, finance, or draft updates..."
              className="flex-1 rounded-xl border border-[#282830] bg-[#18181d] px-3.5 py-2 text-xs font-medium text-white outline-none focus:border-blue-500 transition-all placeholder:text-[#686873]"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white transition-all hover:bg-blue-700 disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
