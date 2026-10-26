'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function WorkspacePagination({ total, page, pageSize, onPageChange, onPageSizeChange }: { total: number; page: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const start = Math.max(1, Math.min(current - 1, pages - 3));
  return <footer className="studio-pagination">
    <span>Showing {total ? (current - 1) * pageSize + 1 : 0} to {Math.min(current * pageSize, total)} of {total}</span>
    <div><button type="button" aria-label="Previous page" disabled={current === 1} onClick={() => onPageChange(current - 1)}><ChevronLeft size={14} />Previous</button>
      {Array.from({ length: Math.min(4, pages) }, (_, index) => start + index).map((value) => <button type="button" key={value} aria-current={value === current ? 'page' : undefined} onClick={() => onPageChange(value)}>{value}</button>)}
      <button type="button" aria-label="Next page" disabled={current === pages} onClick={() => onPageChange(current + 1)}>Next<ChevronRight size={14} /></button>
      <select aria-label="Rows per page" value={pageSize} onChange={(event) => { onPageSizeChange(Number(event.target.value)); onPageChange(1); }}>{[6, 10, 20, 50].map((size) => <option key={size} value={size}>{size} / page</option>)}</select>
    </div>
  </footer>;
}
