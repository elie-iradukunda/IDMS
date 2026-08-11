import { useState, useEffect } from 'react';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { qs } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { usePagedFetch } from '../../lib/useFetch.js';
import { useDebounced } from '../../lib/useDebounced.js';
import { downloadCsv, stamped } from '../../lib/csv.js';
import { Card, Empty, Loading, ErrorState } from '../../components/ui.jsx';
import { timeAgo } from '../../lib/format.js';

const PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────
// Audit log. Every action on a record is logged, because an inaccurate
// registry causes real harm to a real person and so changes must be
// attributable.
//
// That guarantee only holds if the log can actually be interrogated. The
// search runs in the database over the whole table rather than over whatever
// happened to be on screen — an investigation is by definition looking for
// something old, and a search that only covers the newest page would answer
// "nothing found" about an entry that exists. Paging exists for the same
// reason: the log is append-only and grows for as long as the district uses
// the system.
// ─────────────────────────────────────────────────────────────
export default function AuditPage() {
  const { t, a } = useUI();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const term = useDebounced(q, 400);

  // A new search starts at the first page; staying on page 7 of the previous
  // result set shows an empty list and reads as "no matches".
  useEffect(() => { setPage(0); }, [term]);

  const { data, total, loading, error, reload } =
    usePagedFetch(`/admin/audit${qs({ q: term, limit: PAGE_SIZE, offset: page * PAGE_SIZE })}`);

  const rows = data || [];
  const from = total ? page * PAGE_SIZE + 1 : 0;
  const to = page * PAGE_SIZE + rows.length;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const exportCsv = () => downloadCsv(stamped('audit-log'), [
    { header: 'Timestamp', value: (r) => new Date(r.createdAt).toISOString() },
    { header: 'Actor', value: (r) => r.actorName },
    { header: 'Actor ID', value: (r) => r.actorId ?? '' },
    { header: 'Action', value: (r) => r.action },
    { header: 'Entity', value: (r) => r.entity ?? '' },
    { header: 'Detail', value: (r) => (r.meta ? JSON.stringify(r.meta) : '') },
  ], rows);

  return (
    <>
      <div className="toolbar">
        <div className="grow">
          <label htmlFor="aud-q" className="sr-only">{t.x('Search the audit log', 'Shakisha muri audit log')}</label>
          <input
            id="aud-q" className="input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t.x('Search by action, person or record…', 'Shakisha igikorwa, umuntu, inyandiko…')}
          />
        </div>
        <button className="btn ghost sm" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-[15px] w-[15px]" aria-hidden="true" />
          {t.x('Export this page (CSV)', 'Kuramo (CSV)')}
        </button>
      </div>

      <Card style={{ marginTop: 16 }}>
        <div className="card-t">{t.x('Audit log', 'Audit log')}</div>
        <small className="hint">
          {t.x(
            'Every action on a record is logged: an inaccurate registry causes real harm to a real person, so changes must be attributable. Entries are never edited or deleted — including by an administrator.',
            'Buri gikorwa ku nyandiko kirandikwa kandi ntikigira uko gihindurwa cyangwa gisibwa — n\'umuyobozi ntabishobora.',
          )}
        </small>

        {loading ? <Loading />
          : error ? <ErrorState error={error} onRetry={reload} />
          : rows.length ? (
            <>
              <p className="page-sub" style={{ marginTop: 12 }} role="status">
                {t.x(
                  `Showing ${from}–${to} of ${total} entries`,
                  `Byerekanwa ${from}–${to} kuri ${total}`,
                )}
              </p>

              {rows.map((x) => (
                <div key={x.id} className="notif" style={{ alignItems: 'flex-start' }}>
                  <div className="notif-ico" aria-hidden="true">📝</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.45 }}>{x.action}</div>
                    <small className="hint">
                      {x.actorName} · {timeAgo(x.createdAt, a.lang)}
                      {x.entity ? ` · ${x.entity}` : ''}
                    </small>
                    {/* The before/after of a change is the part that makes the
                        log evidence rather than a list of verbs. */}
                    {x.meta && Object.keys(x.meta).length > 0 && (
                      <details style={{ marginTop: 6 }}>
                        <summary className="hint" style={{ cursor: 'pointer', fontSize: 12.5 }}>
                          {t.x('What changed', 'Ibyahindutse')}
                        </summary>
                        <pre style={{
                          marginTop: 6, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word', color: 'var(--muted)',
                          background: 'var(--surface-2)', border: '1px solid var(--border)',
                          borderRadius: 10, padding: '9px 11px',
                        }}>
                          {JSON.stringify(x.meta, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}

              <div className="row-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn ghost sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Newer', 'Bishya')}
                </button>
                <small className="hint">{t.x(`Page ${page + 1} of ${lastPage + 1}`, `Ipaji ${page + 1} kuri ${lastPage + 1}`)}</small>
                <button className="btn ghost sm" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
                  {t.x('Older', 'Bishaje')} <ChevronRight className="h-[14px] w-[14px]" aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <Empty
              title={term
                ? t.x('No entries match that search', 'Nta cyabonetse')
                : t.x('The audit log is empty', 'Audit log ni ubusa')}
              sub={term
                ? t.x('Try the name of a person, a record code such as B-1004, or a word from the action.',
                  'Gerageza izina ry\'umuntu, code nka B-1004, cyangwa ijambo ryo mu gikorwa.')
                : t.x('Entries appear as soon as records are registered, changed or decided upon.',
                  'Bizagaragara ubwo inyandiko zizandikwa cyangwa zihindurwa.')}
            />
          )}
      </Card>
    </>
  );
}
