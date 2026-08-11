// ─────────────────────────────────────────────────────────────
// Small presentational primitives shared across pages.
// ─────────────────────────────────────────────────────────────
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { REQ_BADGE } from '../lib/constants.js';
import { useUI } from '../context/UIContext.jsx';
import { timeAgo } from '../lib/format.js';

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Badge({ tone = 'gray', children, style }) {
  return (
    <span className={`badge b-${tone}`} style={style}>
      <span className="dot" />
      {children}
    </span>
  );
}

// Support-request status badge (localised).
export function ReqBadge({ status }) {
  const { t } = useUI();
  const tone = (REQ_BADGE[status] || 'b-gray').replace('b-', '');
  return <Badge tone={tone}>{t(status)}</Badge>;
}

// Impairment chips: "Seeing · A lot of difficulty".
export function ImpairmentTags({ list = [] }) {
  const { t } = useUI();
  return (
    <>
      {list.map((d, i) => (
        <span key={i} className="badge b-sky" style={{ marginRight: 6, marginBottom: 4 }}>
          <span className="dot" />
          {t.d(d.type)} · {t.diff(d.level)}
        </span>
      ))}
    </>
  );
}

// A support-request timeline. Accepts the API's RequestEvent rows
// ({ label, createdAt }) or plain { t, w } objects.
export function Timeline({ items = [] }) {
  const { a } = useUI();
  return (
    <div className="tl">
      {items.map((it, i) => (
        <div key={it.id ?? i} className="tl-item">
          <div className="tl-t">{it.label ?? it.t}</div>
          <div className="tl-w">{it.w ?? timeAgo(it.createdAt, a.lang)}</div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, sub }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {sub}
    </div>
  );
}

export function Loading({ label }) {
  const { t } = useUI();
  return (
    <div className="load-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      {label || t.x('Loading…', 'Biratunganywa…')}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useUI();
  return (
    <div className="warn" role="alert" style={{ marginTop: 22 }}>
      {error?.message || t.x('Something went wrong.', 'Hari ikitagenze neza.')}
      {onRetry && (
        <div className="row-actions">
          <button className="btn red sm" onClick={onRetry}>
            {t.x('Try again', 'Ongera ugerageze')}
          </button>
        </div>
      )}
    </div>
  );
}

const STAT_ACCENTS = {
  green: 'linear-gradient(135deg,#38b06a,#087536)',
  emerald: 'linear-gradient(135deg,#34d399,#059669)',
  blue: 'linear-gradient(135deg,#60a5fa,#2563eb)',
  amber: 'linear-gradient(135deg,#fbbf24,#d97706)',
  violet: 'linear-gradient(135deg,#a78bfa,#7c3aed)',
  rose: 'linear-gradient(135deg,#fb7185,#e11d48)',
};

// Fuel-style KPI card: gradient icon tile + label + big value.
export function StatCard({ icon: Icon, label, value, subtext, color = 'green' }) {
  return (
    <div className="stat">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {Icon && (
          <div
            style={{
              width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', flexShrink: 0,
              background: STAT_ACCENTS[color] || STAT_ACCENTS.green,
              boxShadow: '0 8px 24px rgba(8,117,54,.18)',
            }}
          >
            <Icon size={24} />
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="stat-l">{label}</div>
          <div className="stat-v" style={{ marginTop: 4 }}>{value}</div>
          {subtext ? <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--muted-2)' }}>{subtext}</div> : null}
        </div>
      </div>
    </div>
  );
}

// Pagination control for the long lists (registry, audit).
//
// It states the range and the total, not just "next/previous". A district
// registry is measured against ~2,400 people, so "24 records" on screen with
// no total is the difference between an officer believing their search found
// almost nobody and knowing it found four hundred.
export function Pager({ page, pageSize, total, count, onPage }) {
  const { t } = useUI();
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const from = total ? page * pageSize + 1 : 0;
  const to = page * pageSize + count;

  if (total <= pageSize) return null;

  return (
    <nav
      className="row-actions"
      style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}
      aria-label={t.x('Pagination', 'Amapaji')}
    >
      <button className="btn ghost sm" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))}>
        <ChevronLeft className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Previous', 'Ibibanza')}
      </button>
      <small className="hint" role="status">
        {t.x(`Showing ${from}–${to} of ${total}`, `Byerekanwa ${from}–${to} kuri ${total}`)}
      </small>
      <button className="btn ghost sm" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
        {t.x('Next', 'Ibikurikira')} <ChevronRight className="h-[14px] w-[14px]" aria-hidden="true" />
      </button>
    </nav>
  );
}

// A labelled horizontal bar used in the analytics cards.
export function BarRow({ label, count, total }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 4 }}>
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <b>{count}</b>
      </div>
      <div className="bar">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
