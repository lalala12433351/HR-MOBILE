'use client';

import React, { useEffect, useId, useRef } from 'react';
import { ChevronDown, X } from 'lucide-react';
import mobileDrawerStyles from '@/components/common/mobile-drawers.module.css';

/** Layouts from Projects / Add task (71:2787, 280:9553) and Task details (71:2554, 280:9492). */
export function TaskPanel({ title, description, onClose, children, details = false, centered = false }: {
  title: string; description: string; onClose: () => void; children: React.ReactNode; details?: boolean; centered?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]') || []).filter(el => el.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className={`task-panel-overlay ${mobileDrawerStyles.overlay}${centered ? ' task-panel-overlay--centered' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" data-drawer-kind={details ? 'detail' : 'form'} aria-label={details ? 'Task details' : title} className={`task-panel ${mobileDrawerStyles.panel}${details ? ' task-panel--details' : ''}`}>
      {details && <button type="button" className="task-panel-back" onClick={onClose}>Back to projects</button>}
      <header className="task-panel-header">
        <div><h2>{title}</h2><p>{description}</p></div>
        <button type="button" className="task-panel-close" aria-label={details ? 'Close task details' : title === 'Add a task' ? 'Close task form' : 'Close ' + title.toLowerCase()} onClick={onClose}><X size={16} /></button>
      </header>
      {children}
    </div>
  </div>;
}

export function TaskPeopleField({ value, people, onChange, disabled = false, label = 'Assignees' }: {
  value: string[]; people: Array<{ id: string; name: string }>; onChange: (ids: string[]) => void; disabled?: boolean; label?: string;
}) {
  const id = useId();
  const names = value.map(key => people.find(person => person.id === key)?.name).filter(Boolean).join(' · ');
  return <div className="task-field"><span id={id}>{label}</span>
    {disabled ? <div className="task-readonly">{names || 'Unassigned'}</div> : <details className="task-people">
      <summary aria-labelledby={id}><span>{names || 'Select people'}</span><ChevronDown size={16} /></summary>
      <div className="task-people-options" role="group" aria-labelledby={id}>
        {people.length ? people.map(person => <label key={person.id}><input type="checkbox" checked={value.includes(person.id)} onChange={e => onChange(e.target.checked ? [...value, person.id] : value.filter(key => key !== person.id))} />{person.name}</label>) : <p>No people available</p>}
      </div>
    </details>}
  </div>;
}
