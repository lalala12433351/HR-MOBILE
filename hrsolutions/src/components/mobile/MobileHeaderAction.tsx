'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
export function MobileHeaderAction({ children }: { children: React.ReactNode }) {
 const [target, setTarget] = useState<HTMLElement | null>(null);
 useEffect(() => { setTarget(document.getElementById('m2-page-actions')); }, []);
 return target ? createPortal(children, target) : null;
}
