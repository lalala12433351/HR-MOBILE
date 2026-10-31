'use client';

import { useEffect, useRef } from 'react';

/** Keyboard and focus lifecycle for existing custom drawers, including nested dialogs. */
export function useDrawerFocus(open: boolean, onClose: () => void) {
 const panel = useRef<HTMLDivElement>(null);
 const close = useRef(onClose);
 close.current = onClose;
 useEffect(() => {
  if (!open || !panel.current) return;
  const element = panel.current;
  const previous = document.activeElement as HTMLElement | null;
  const overflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  element.focus({ preventScroll:true });
  const onKey = (event: KeyboardEvent) => {
   const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).filter(el => el.getClientRects().length > 0);
   if (dialogs.at(-1) !== element) return;
   if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
   if (event.key !== 'Tab') return;
   const items = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, a[href]')).filter(el => el.getClientRects().length > 0);
   const first = items[0], last = items.at(-1);
   if (!first || !last) { event.preventDefault(); return; }
   if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
   else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  return () => { document.removeEventListener('keydown', onKey);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true}); };
 }, [open]);
 return panel;
}
