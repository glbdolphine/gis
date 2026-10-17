import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { GeoStatus } from '../types/gis';
import { STATUS_COLORS, STATUS_LABELS } from './map/mapIcons';

// Small shared UI pieces so the eight views stay consistent.

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'inline-flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50',
  ghost:
    'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100',
};

export const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  right,
  children,
  className = '',
  padded = true,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {right}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'red' | 'blue';
}) {
  const tones: Record<string, string> = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
    blue: 'text-blue-700',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: GeoStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${c}1a`, color: c }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Bar({ value, max, color = '#059669' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      {body && <p className="mt-1 max-w-md text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[90vh] w-full flex-col rounded-lg bg-white shadow-xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button className={btn.ghost} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
