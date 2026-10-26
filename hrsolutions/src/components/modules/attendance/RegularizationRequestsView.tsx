'use client';
import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AttendanceRegularization } from '@/types';
import { UserAvatar } from '@/components/common/UserAvatar';
import { WorkspacePagination } from '@/components/common/WorkspacePagination';
import { AttendanceStatusPill } from './AttendanceStatusPill';

export function RegularizationRequestsView({ requests, currentEmployeeId, canReview, onReview }: { requests: AttendanceRegularization[]; currentEmployeeId: string; canReview: (request: AttendanceRegularization) => boolean; onReview: (id: string, approve: boolean) => unknown }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [scope, setScope] = useState('all');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [saving, setSaving] = useState<string | null>(null);
  const filtered = useMemo(() => requests.filter((request) => (status === 'All' || request.status === status) && (scope !== 'mine' || request.employeeId === currentEmployeeId) && (!month || request.date.startsWith(month)) && `${request.employeeName} ${request.department || ''} ${request.reason} ${request.remarks}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => b.date.localeCompare(a.date)), [requests,status,scope,month,currentEmployeeId,query]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const review = async (id: string, approved: boolean) => { if (saving) return; setSaving(id); try { await onReview(id, approved); } finally { setSaving(null); } };
  const actions = (request: AttendanceRegularization) => request.status === 'Pending' && canReview(request) ? <div className="request-review-actions"><button disabled={saving !== null} onClick={() => void review(request.id, true)}>Approve</button><button disabled={saving !== null} onClick={() => void review(request.id, false)}>Reject</button></div> : <span className="request-reviewed">{request.status === 'Pending' ? 'Awaiting approval' : request.approvedBy ? `Reviewed by ${request.approvedBy}` : 'Reviewed'}</span>;
  const badge = (request: AttendanceRegularization) => <AttendanceStatusPill kind={request.status === 'Approved' ? 'approved' : request.status === 'Rejected' ? 'rejected' : 'pending'} label={request.status} />;
  return <section className="request-workspace" aria-label="Regularization requests">
    <div className="request-toolbar"><label className="request-search"><Search size={16}/><input aria-label="Search regularizations" placeholder="Search employee or reason" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }}/></label>
      <select aria-label="Regularization scope" value={scope} onChange={(e) => { setScope(e.target.value); setPage(1); }}><option value="all">All visible requests</option><option value="mine">My requests</option></select>
      <select aria-label="Regularization status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>{['All','Pending','Approved','Rejected'].map((value) => <option key={value} value={value}>{value === 'All' ? 'All statuses' : value}</option>)}</select>
      <input type="month" aria-label="Regularization month" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }}/>
      {(query || status !== 'All' || scope !== 'all' || month) && <button className="request-clear" onClick={() => { setQuery(''); setStatus('All'); setScope('all'); setMonth(''); setPage(1); }}>Clear filters</button>}
    </div>
    <div className="request-table-scroll"><table className="request-table"><thead><tr><th>Employee</th><th>Attendance date</th><th>Requested punches</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((request) => <tr key={request.id}><td><div className="request-person"><UserAvatar name={request.employeeName} src={request.avatar} className="h-9 w-9"/><div><strong>{request.employeeName}</strong><small>{request.department || 'Employee'}</small></div></div></td><td>{request.date}<small>Applied {request.appliedOn || request.date}</small></td><td>{request.requestedCheckIn || '-'} to {request.requestedCheckOut || '-'}</td><td><strong>{request.reason}</strong><small className="request-reason">{request.remarks || 'No additional remarks'}</small></td><td>{badge(request)}</td><td>{actions(request)}</td></tr>)}</tbody></table></div>
    <div className="request-mobile-list">{rows.map((request) => <article key={request.id}><header><div className="request-person"><UserAvatar name={request.employeeName} src={request.avatar} className="h-9 w-9"/><div><strong>{request.employeeName}</strong><small>{request.date}</small></div></div>{badge(request)}</header><dl><div><dt>Reason</dt><dd>{request.reason}</dd></div><div><dt>Punches</dt><dd>{request.requestedCheckIn || '-'} to {request.requestedCheckOut || '-'}</dd></div></dl><p>{request.remarks}</p><footer>{actions(request)}</footer></article>)}</div>
    {!filtered.length && <div className="request-empty"><strong>No regularizations found</strong><p>{requests.length ? 'Try a different search or clear your filters.' : 'Attendance correction and work from home requests will appear here.'}</p></div>}
    <WorkspacePagination total={filtered.length} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}/>
  </section>;
}
