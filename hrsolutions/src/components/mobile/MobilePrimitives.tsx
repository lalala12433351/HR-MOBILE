'use client';
import React from 'react';
import Link from 'next/link';
export function MobileRow({ title, detail, href, onClick, children, arrow = true }: {
 title: string; detail?: string; href?: string; onClick?: () => void; children?: React.ReactNode; arrow?: boolean;
}) {
 const content = <>{children}<span className="m2-row-copy"><span className="m2-row-title">{title}</span>{detail && <span className="m2-row-detail">{detail}</span>}</span>{arrow && <img src="/mobile-v2/more-navigation-forward.svg" width="16" height="16" alt="" />}</>;
 return href ? <Link href={href} className="m2-row">{content}</Link> : onClick ? <button type="button" onClick={onClick} className="m2-row">{content}</button> : <div className="m2-row">{content}</div>;
}
export function MobileSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
 return <section className="m2-section"><div className="m2-section-heading"><h2>{title}</h2>{action}</div><div className="m2-section-body">{children}</div></section>;
}
