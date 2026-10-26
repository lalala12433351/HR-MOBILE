'use client';
import './public-profile.css';

import React, { useId, useMemo, useRef, useState } from 'react';
import { ArrowUp, Camera, Mail, Phone, User } from 'lucide-react';
import { Employee } from '@/types';
import { UserAvatar } from '@/components/common/UserAvatar';

export interface EmployeePublicProfilePanelProps {
  employee: Employee | Record<string, any>;
  allEmployees: Employee[];
  isInstitution?: boolean;
  /** When true, avatar click opens file picker (caller handles upload). */
  showAvatarEdit?: boolean;
  onAvatarFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploadingAvatar?: boolean;
  /** Optional controlled bio editor (Public Profile tab). */
  bioEditable?: boolean;
  bioDraft?: string;
  bioActions?: React.ReactNode;
  onBioDraftChange?: (value: string) => void;
  /**
   * `peek` — coworker directory / org-chart modal.
   * `embedded` / `page` — Public Profile tab inside employee detail.
   */
  variant?: 'peek' | 'embedded' | 'page';
  className?: string;
}

type ProfileTab = 'summary' | 'personal';

const isCartoonAvatar = (url?: string) => {
  if (!url) return true;
  return (
    url.includes('api.dicebear.com') ||
    url.includes('avataaars') ||
    url.startsWith('data:image/svg+xml;utf8,<svg')
  );
};

function statusTone(status?: string): { label: string; className: string } | null {
  if (!status) return null;
  const normalized = status.trim();
  if (!normalized || normalized === 'Activated' || normalized === 'Active') {
    return { label: 'Active', className: 'bg-[#eaf1ee] text-[#3f6a52] border-[#53886b]/30' };
  }
  if (normalized === 'On Leave') {
    return { label: 'On leave', className: 'bg-[#e8eef2] text-[#17324e] border-[#c5d0d8]' };
  }
  if (normalized === 'In Probation') {
    return { label: 'Probation', className: 'bg-[#e8eef2] text-[#17324e] border-[#c5d0d8]' };
  }
  if (normalized === 'Notice Period') {
    return { label: 'Notice period', className: 'bg-[#faeeee] text-[#8b3133] border-[#8b3133]/25' };
  }
  if (normalized === 'Not Activated' || normalized === 'Inactive') {
    return { label: 'Inactive', className: 'bg-[#e8eef2] text-[#17324e] border-[#c5d0d8]' };
  }
  if (
    normalized === 'Invited' ||
    normalized === 'Suspended' ||
    normalized === 'Deactivated' ||
    normalized === 'Terminated'
  ) {
    return { label: normalized, className: 'bg-[#e8eef2] text-[#17324e] border-[#c5d0d8]' };
  }
  return { label: normalized, className: 'bg-[#e8eef2] text-[#17324e] border-[#c5d0d8]' };
}

function PersonChip({
  name,
  designation,
  avatar,
  emphasize = false,
}: {
  name: string;
  designation?: string;
  avatar?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      data-emphasize={emphasize}
      className={`public-profile-person flex items-center gap-3 rounded-[12px] border px-3 py-2.5 ${
        emphasize
          ? 'border-[#17324e]/20 bg-[#f8fbfe] shadow-[0_8px_20px_-12px_rgba(23,50,78,0.22)]'
          : 'border-[#dde4e9] bg-white'
      }`}
    >
      <div
        className={`overflow-hidden rounded-full bg-[#e8eef2] ${
          emphasize ? 'h-11 w-11 ring-2 ring-[#d8e8f2]' : 'h-9 w-9 border border-[#dde4e9]'
        }`}
      >
        <UserAvatar src={avatar} name={name} alt="" className="h-full w-full text-[11px]" iconClassName="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className={`truncate tracking-[-0.02em] text-[#172234] ${emphasize ? 'text-[14px] font-bold' : 'text-[13px] font-semibold'}`}>
          {name}
        </p>
        {designation ? (
          <p className="truncate text-[12px] font-medium text-[#5e6c7b]">{designation}</p>
        ) : null}
      </div>
    </div>
  );
}

function HierarchyArrow() {
  return (
    <div className="flex justify-center py-1.5" aria-hidden>
      <ArrowUp className="h-3.5 w-3.5 text-[#2d628e]" strokeWidth={2.25} />
    </div>
  );
}

export const EmployeePublicProfilePanel: React.FC<EmployeePublicProfilePanelProps> = ({
  employee,
  allEmployees,
  isInstitution = false,
  showAvatarEdit = false,
  onAvatarFileChange,
  isUploadingAvatar = false,
  bioEditable = false,
  bioDraft,
  bioActions,
  onBioDraftChange,
  variant = 'embedded',
  className = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<ProfileTab>('summary');
  const panelId = useId();
  const isPeek = variant === 'peek';
  const isPage = variant === 'page' || variant === 'embedded';

  const isSuper = employee.role === 'super_admin' || employee.employeeId === 'EMP001';
  const displayName = employee.fullName || employee.name || '—';
  const designation =
    employee.designation ||
    (isSuper ? 'Founder & CEO' : employee.role || (isInstitution ? 'Faculty Member' : 'Employee'));
  const bioText =
    bioEditable && bioDraft !== undefined ? bioDraft : String(employee.bio || '').trim();

  const hasManager =
    !!employee.managerId || (!!employee.lineManager?.name && employee.lineManager.name !== '—');
  const managerObj = hasManager
    ? allEmployees.find(
        (e) =>
          (employee.managerId && e.id === employee.managerId) ||
          (employee.lineManager?.name && e.name === employee.lineManager.name)
      )
    : null;
  const managerDisplayName = managerObj
    ? managerObj.fullName || managerObj.name
    : hasManager
      ? employee.managerName || employee.lineManager?.name || '—'
      : null;
  const managerDisplayAvatar =
    managerObj?.avatar || (hasManager ? employee.lineManager?.avatar : undefined);
  const managerDesignation =
    managerObj?.designation || employee.lineManager?.designation || undefined;

  const nextLevelManager = useMemo(() => {
    if (!managerObj?.managerId) return null;
    return allEmployees.find((e) => e.id === managerObj.managerId) || null;
  }, [allEmployees, managerObj]);

  const directReports = allEmployees.filter((e) => e.managerId === employee.id);

  const departmentLine = [employee.department, employee.team].filter(Boolean).join(' · ') || null;
  const officeLine = employee.officeName || employee.location || null;
  const metaLine = [departmentLine, officeLine].filter(Boolean).join('  ·  ').toUpperCase();
  const email = employee.email?.trim();
  const phone = employee.phone?.trim();
  const timezone = employee.timezone?.trim();
  const skills = Array.isArray(employee.skills) ? employee.skills.filter(Boolean) : [];
  const showAbout = bioEditable || !!bioText;
  const status = statusTone(employee.accountStatus);

  const avatarSize = isPeek ? 'h-[88px] w-[88px]' : 'h-[104px] w-[104px]';

  const avatarBlock = (
    <div
      role={showAvatarEdit ? 'button' : undefined}
      tabIndex={showAvatarEdit ? 0 : undefined}
      aria-label={showAvatarEdit ? `Change photo for ${displayName}` : undefined}
      onKeyDown={(event) => { if (showAvatarEdit && !isUploadingAvatar && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); fileInputRef.current?.click(); } }}
      className={`public-profile-avatar relative shrink-0 ${showAvatarEdit ? 'cursor-pointer' : ''}`}
      onClick={() => {
        if (showAvatarEdit && !isUploadingAvatar) fileInputRef.current?.click();
      }}
      title={showAvatarEdit ? (isUploadingAvatar ? 'Uploading…' : 'Change profile picture') : undefined}
    >
      <div
        className={`public-profile-avatar-image overflow-hidden rounded-full border-[3px] border-white bg-[#e8eef2] shadow-[0_12px_28px_-10px_rgba(23,34,52,0.4)] ${avatarSize}`}
      >
        <UserAvatar
          src={employee.avatar}
          name={displayName}
          alt={displayName}
          className="h-full w-full text-base"
          iconClassName={isPeek ? 'h-10 w-10' : 'h-12 w-12'}
        />
      </div>
      {status && (
        <span
          className={`public-profile-identity-status absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] ${status.className}`}
        >
          {status.label}
        </span>
      )}
      {showAvatarEdit && (
        <span className="absolute -right-0.5 top-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#17324e] text-white shadow-sm">
          <Camera className={`h-3.5 w-3.5 ${isUploadingAvatar ? 'animate-pulse' : ''}`} />
        </span>
      )}
    </div>
  );

  const tabs: Array<{ id: ProfileTab; label: string }> = [
    { id: 'summary', label: 'Summary' },
    { id: 'personal', label: 'Personal' },
  ];

  const summaryContent = (
    <div className="public-profile-summary space-y-8 animate-in fade-in duration-200">
      <section className="public-profile-about">
        <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#172234]">About</h3>
        {bioEditable ? (
          <>
            <textarea
              value={bioDraft ?? ''}
              onChange={(e) => onBioDraftChange?.(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Write a short bio coworkers will see…"
              className="mt-3 min-h-[96px] w-full resize-y rounded-[7px] border border-[#c5d0d8] bg-white px-3 py-2.5 text-[13px] font-medium leading-relaxed text-[#172234] placeholder:text-[#5e6c7b] focus:border-[#17324e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
            />
            <p className="public-profile-bio-hint">Write a short bio coworkers will see.</p>
            <div className="public-profile-bio-footer"><span>{(bioDraft ?? '').length}/500</span>{bioActions}</div>
          </>
        ) : showAbout ? (
          <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-wrap text-[#5e6c7b]">{bioText}</p>
        ) : (
          <p className="mt-3 text-[13px] text-[#5e6c7b]">No public bio yet.</p>
        )}

        {skills.length > 0 && (
          <div className="public-profile-skills mt-4"><h4>Skills</h4><div className="flex flex-wrap gap-1.5">
            {skills.slice(0, 12).map((skill) => (
              <span
                key={skill}
                className="rounded-[7px] border border-[#d8e8f2] bg-[#f8fbfe] px-2.5 py-1 text-[12px] font-semibold text-[#17324e]"
              >
                {skill}
              </span>
            ))}
          </div></div>
        )}
      </section>

      <section className="public-profile-team">
        <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#172234]">Team</h3>
        <div className="mt-4 max-w-md">
          {nextLevelManager && (
            <>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#2d628e]">
                Next level manager
              </p>
              <PersonChip
                name={nextLevelManager.fullName || nextLevelManager.name}
                designation={nextLevelManager.designation}
                avatar={nextLevelManager.avatar}
              />
              <HierarchyArrow />
            </>
          )}

          {managerDisplayName ? (
            <>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#2d628e]">
                {isInstitution ? 'Staff lead / HOD' : 'Reporting manager'}
              </p>
              <PersonChip
                name={managerDisplayName}
                designation={managerDesignation}
                avatar={
                  managerDisplayAvatar && !isCartoonAvatar(managerDisplayAvatar)
                    ? managerDisplayAvatar
                    : managerObj?.avatar
                }
              />
              <HierarchyArrow />
            </>
          ) : (
            <p className="mb-3 text-[12px] font-medium text-[#5e6c7b]">No reporting manager · top of tree</p>
          )}

          <PersonChip name={displayName} designation={designation} avatar={employee.avatar} emphasize />

          {directReports.length > 0 && (
            <>
              <div className="flex justify-center py-1.5" aria-hidden>
                <ArrowUp className="h-3.5 w-3.5 rotate-180 text-[#2d628e]" strokeWidth={2.25} />
              </div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#2d628e]">
                Direct reports · {directReports.length}
              </p>
              <div className="space-y-2">
                {directReports.slice(0, 6).map((report) => (
                  <PersonChip
                    key={report.id}
                    name={report.fullName || report.name}
                    designation={report.designation}
                    avatar={report.avatar}
                  />
                ))}
                {directReports.length > 6 && (
                  <p className="text-[12px] font-medium text-[#5e6c7b]">
                    +{directReports.length - 6} more
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );

  const personalContent = (
    <div className="animate-in fade-in duration-200">
      <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#172234]">Contact & workplace</h3>
      <dl className="public-profile-contact-grid mt-4 divide-y divide-[#dde4e9] border-y border-[#dde4e9]">
        {[
          {
            label: 'Email',
            value: email ? (
              <a
                href={`mailto:${email}`}
                className="text-[#17324e] underline-offset-2 transition-colors hover:text-[#285275] hover:underline"
              >
                {email}
              </a>
            ) : (
              '—'
            ),
          },
          {
            label: 'Phone',
            value: phone ? (
              <a
                href={`tel:${phone}`}
                className="text-[#17324e] underline-offset-2 transition-colors hover:text-[#285275] hover:underline"
              >
                {phone}
              </a>
            ) : (
              '—'
            ),
          },
          ...(timezone ? [{ label: 'Timezone', value: timezone }] : []),
          { label: 'Department', value: departmentLine || '—' },
          { label: 'Office', value: officeLine || '—' },
          {
            label: isInstitution ? 'Staff lead / HOD' : 'Line manager',
            value: (
              <span className="inline-flex items-center gap-2">
                {managerDisplayName && <UserAvatar src={managerDisplayAvatar} name={managerDisplayName} className="h-6 w-6 text-[10px]" />}
                {managerDisplayName || 'None / top level'}
              </span>
            ),
          },
          ...(directReports.length > 0
            ? [
                {
                  label: 'Reports',
                  value: `${directReports.length} team member${directReports.length === 1 ? '' : 's'}`,
                },
              ]
            : []),
        ].map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 py-3.5 sm:grid-cols-[140px_minmax(0,1fr)]"
          >
            <dt className="text-[12px] font-semibold leading-5 text-[#5e6c7b]">{row.label}</dt>
            <dd className="min-w-0 text-[13px] font-semibold leading-5 text-[#172234] break-words">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );

  return (
    <div className={`public-profile-panel text-[#172234] ${className}`} data-context={isPeek ? 'peek' : 'record'}>
      {showAvatarEdit && onAvatarFileChange && (
        <input
          type="file"
          ref={fileInputRef}
          onChange={onAvatarFileChange}
          accept="image/*"
          className="hidden"
          disabled={isUploadingAvatar}
        />
      )}

      {/* Identity hero — light Clean Sheet, no muddy navy/gray slab */}
      <header
        className={`public-profile-hero relative border-b border-[#d8e8f2] bg-[#f8fbfe] ${
          isPeek ? 'px-6 pb-7 pt-9 sm:px-8' : 'px-6 pb-8 pt-9 sm:px-10'
        }`}
      >
        <div className="flex flex-col items-center text-center">
          <div className={status ? 'mb-5' : 'mb-3'}>{avatarBlock}</div>
          <h2 className="mt-1 max-w-[28ch] text-[22px] font-bold leading-tight tracking-[-0.028em] text-[#172234] sm:text-[26px]">
            {displayName}
          </h2>
          <p className="mt-1.5 text-[14px] font-medium text-[#5e6c7b]">{designation}</p>
          {metaLine ? (
            <p className="mt-2 max-w-[40ch] text-[11px] font-semibold tracking-[0.08em] text-[#2d628e]">
              {metaLine}
            </p>
          ) : null}

          <div className="public-profile-contact-actions mt-5 flex items-center justify-center gap-2.5">
            {email ? (
              <a
                href={`mailto:${email}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#c5d0d8] bg-white text-[#17324e] transition-colors hover:border-[#17324e] hover:bg-[#e8eef2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                aria-label={`Email ${displayName}`}
                title={email}
              >
                <Mail size={18} className="h-[18px] w-[18px]" strokeWidth={2} />
              </a>
            ) : null}
            {phone ? (
              <a
                href={`tel:${phone}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[7px] bg-[#17324e] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#285275] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
                aria-label={`Call ${displayName}`}
              >
                Call
              </a>
            ) : email ? (
              <a
                href={`mailto:${email}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[7px] bg-[#17324e] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#285275] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
              >
                <Mail className="h-3.5 w-3.5" strokeWidth={2} />
                Message
              </a>
            ) : null}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div
        className={`public-profile-tabs sticky top-0 z-10 border-b border-[#dde4e9] bg-white ${
          isPeek ? 'px-6 sm:px-8' : 'px-6 sm:px-10'
        }`}
      >
        <nav className="flex gap-6" aria-label="Profile sections" role="tablist" onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
          const index = buttons.findIndex((button) => button === document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
          event.preventDefault();
          buttons[next]?.focus();
          buttons[next]?.click();
        }}>
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`${panelId}-tab-${item.id}`}
                aria-controls={`${panelId}-content`}
                tabIndex={active ? 0 : -1}
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`relative -mb-px py-3.5 text-[13px] font-bold tracking-[-0.01em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2] focus-visible:ring-offset-2 ${
                  active ? 'text-[#17324e]' : 'text-[#5e6c7b] hover:text-[#17324e]'
                }`}
              >
                {item.label}
                {active ? (
                  <span className="absolute inset-x-0 bottom-0 h-[2.5px] rounded-full bg-[#17324e]" />
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div role="tabpanel" id={`${panelId}-content`} aria-labelledby={`${panelId}-tab-${tab}`} className={`public-profile-body px-6 py-6 sm:px-8 sm:py-7 ${isPage ? 'sm:px-10' : ''}`}>
        {tab === 'summary' ? summaryContent : personalContent}
      </div>
    </div>
  );
};
