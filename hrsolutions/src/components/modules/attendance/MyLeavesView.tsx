'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { LeaveRequest } from '@/types';
import { WorkspacePagination } from '@/components/common/WorkspacePagination';
import { AttendanceStatusPill } from './AttendanceStatusPill';
import { toLocalDateKey } from '@/utils/attendancePunches';

export type MyLeaveBalance = { label: string; remaining: number; quota: number; used: number; pending: number; restricted?: boolean; onRequest?: () => void };
const dateLabel = (value: string, year = false) => {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', ...(year ? { year: 'numeric' as const } : {}) });
};
const statusPill = (request: LeaveRequest) => <AttendanceStatusPill kind={request.status === 'Approved' ? 'approved' : request.status === 'Pending' || request.status === 'Manager approved' ? 'pending' : request.status === 'Rejected' ? 'rejected' : 'neutral'} label={request.status === 'Pending' ? 'Pending approval' : request.status} />;
const duration = (request: LeaveRequest) => `${dateLabel(request.startDate)}${request.endDate !== request.startDate ? ` to ${dateLabel(request.endDate)}` : ''} (${request.daysCount}d)`;

export function MyLeavesView({ balances, requests, rows, filters, page, pageSize, total, saving, onCancel, onPageChange, onPageSizeChange, probation, monthlyCycle, canCancelManagerApproved }: {
  balances: MyLeaveBalance[]; requests: LeaveRequest[]; rows: LeaveRequest[]; filters: React.ReactNode; page: number; pageSize: number; total: number; saving: boolean;
  onCancel: (id: string) => unknown; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void; probation: boolean; monthlyCycle: boolean; canCancelManagerApproved: boolean;
}) {
  const today = toLocalDateKey();
  const upcoming = requests.filter((request) => ['Pending', 'Manager approved', 'Approved'].includes(request.status) && request.endDate.slice(0,10) >= today).sort((a,b) => a.startDate.localeCompare(b.startDate))[0];
  const action = (request: LeaveRequest) => request.status === 'Pending' || (request.status === 'Manager approved' && canCancelManagerApproved) ? <button type="button" disabled={saving} className="my-leaves-cancel" onClick={() => void onCancel(request.id)}>{saving ? 'Please wait...' : 'Cancel request'}</button> : <span className="my-leaves-reviewed">{request.status === 'Cancelled' ? 'Cancelled' : request.status === 'Manager approved' ? 'Awaiting HR approval' : 'Reviewed'}</span>;
  return <div className="my-leaves-view">
    {probation && <div className="my-leaves-probation"><Info size={16}/><p>Probation policy is active. Paid leave is restricted until probation completion. Absences are recorded as unpaid leave.</p></div>}
    <section className="my-leaves-balances" aria-label="My leave balances">{balances.map((balance) => {
      const content = <><header><h3>{balance.label}</h3>{balance.restricted && <span>Restricted</span>}</header><p className="my-leaves-balance-value"><strong>{balance.restricted ? 0 : balance.remaining}</strong><span>/ {balance.restricted ? 0 : balance.quota} days</span></p><div className="my-leaves-meter" role="progressbar" aria-label={`${balance.label} remaining`} aria-valuemin={0} aria-valuemax={Math.max(0,balance.quota)} aria-valuenow={balance.restricted ? 0 : Math.max(0, Math.min(balance.quota, balance.remaining))}><span style={{width:`${balance.restricted || balance.quota <= 0 ? 0 : Math.max(0,Math.min(100,balance.remaining / balance.quota * 100))}%`}}/></div><p className="my-leaves-balance-note">{balance.onRequest ? 'Tap to request · manager approves in Regularizations' : balance.pending > 0 ? `${balance.pending}d pending` : `${balance.used}d used`}</p></>;
      return balance.onRequest ? <button type="button" key={balance.label} className="my-leaves-balance" onClick={balance.onRequest}>{content}</button> : <article key={balance.label} className="my-leaves-balance">{content}</article>;
    })}</section>
    {upcoming && <aside className="my-leaves-upcoming"><Info size={17}/><div><strong>{upcoming.startDate.slice(0,10) < today ? 'Your current time off' : 'Your next time off'} · {duration(upcoming)}</strong><p>{upcoming.leaveType} · {upcoming.status === 'Pending' ? 'Pending approval' : upcoming.status === 'Manager approved' ? 'Manager approved, awaiting HR approval' : 'Approved'}{upcoming.approvedBy ? ` · ${upcoming.approvedBy}` : ''}</p></div></aside>}
    <section className="my-leaves-history" aria-label="My leave history"><header><h3>Leave history <span>· {requests.length} {requests.length === 1 ? 'request' : 'requests'}</span></h3></header>{filters}
      <div className="my-leaves-desktop"><table><thead><tr><th>Leave type</th><th>Dates &amp; duration</th><th>Reason</th><th>Applied on</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map((request) => <tr key={request.id}><td>{request.leaveType}</td><td>{duration(request)}</td><td className="my-leaves-reason">{request.reason || '-'}{request.rejectionReason && <small>Review note: {request.rejectionReason}</small>}</td><td>{dateLabel(request.appliedOn || request.startDate,true)}</td><td>{statusPill(request)}</td><td>{action(request)}</td></tr>)}</tbody></table></div>
      <div className="my-leaves-mobile">{rows.map((request) => <article key={request.id}><header><strong>{request.leaveType}</strong>{statusPill(request)}</header><p className="my-leaves-dates">{duration(request)}</p><p>{request.reason || 'No reason provided'}</p>{request.rejectionReason && <p>Review note: {request.rejectionReason}</p>}<footer><span>Applied {dateLabel(request.appliedOn || request.startDate,true)}</span>{action(request)}</footer></article>)}</div>
      {!rows.length && <div className="my-leaves-empty"><strong>{requests.length ? 'No matching leave requests' : 'No leave requests yet'}</strong><p>{requests.length ? 'Change your filters to see more requests.' : 'Use Apply for leave to request time away.'}</p></div>}
      <WorkspacePagination total={total} page={page} pageSize={pageSize} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange}/>
    </section>
    <p className="my-leaves-footnote">Balances follow your workspace leave policy and {monthlyCycle ? 'monthly grant cycle' : 'annual grant cycle'}. Pending requests are shown separately for reference.</p>
  </div>;
}
