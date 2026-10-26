'use client';
import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { MobileRow, MobileSection } from '@/components/mobile/MobilePrimitives';
import { getMobileMoreLinks } from '@/utils/mobileWorkspaceNav';
function MoreContent() {
 const { state, currentPersona, logout } = useApp();
 const params = useSearchParams();
 if (!currentPersona) return null;
 const profile = '/hr?emp=' + encodeURIComponent(currentPersona.id);
 const { featured, additional } = getMobileMoreLinks(state.organization, currentPersona);
 if (params.get('panel') === 'workspace') return <div className="m2-page"><MobileSection title="Your workspace"><MobileRow title={state.organization?.name || 'Your workspace'} detail="Current workspace" arrow={false} /><MobileRow title="Use another account" detail="Sign out and use another workspace account" onClick={logout} /></MobileSection><MobileRow title="Back to your workspace" href="/more" /></div>;
 return <div className="m2-page"><MobileRow title={currentPersona.name} detail={(currentPersona.designation || 'Team member') + ' · View profile'} href={profile} /><MobileSection title="Explore"><div>{featured.map(row => <MobileRow key={row.title} {...row} />)}</div></MobileSection><div>{additional.map(n => <MobileRow key={n.href} {...n} />)}</div></div>;
}
export default function MorePage() { return <Suspense fallback={null}><MoreContent /></Suspense>; }
