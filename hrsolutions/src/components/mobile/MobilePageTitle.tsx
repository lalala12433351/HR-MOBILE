'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
export function MobilePageTitle({title,onBack}:{title:string;onBack?:()=>void}){
 const [targets,setTargets]=useState<{title:HTMLElement|null;back:HTMLElement|null}>({title:null,back:null});
 useEffect(()=>setTargets({title:document.getElementById('m2-page-title'),back:document.getElementById('m2-page-back')}),[]);
 return <>{targets.title&&createPortal(<span className="m2-custom-title">{title}</span>,targets.title)}{onBack&&targets.back&&createPortal(<button type="button" className="m2-icon-button" aria-label="Back to previous view" onClick={onBack}><img src="/mobile-v2/auth-back.svg" width="20" height="20" alt=""/></button>,targets.back)}</>;
}
