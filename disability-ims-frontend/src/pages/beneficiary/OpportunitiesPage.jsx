import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Empty, Loading, ErrorState } from '../../components/ui.jsx';
import { timeAgo } from '../../lib/format.js';

// Opportunities & announcements published for persons with disabilities.
export default function OpportunitiesPage() {
  const { t, a } = useUI();
  const { data, loading, error, reload } = useFetch('/opportunities');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.length) return <Empty title={t.x('No opportunities yet', 'Nta mahirwe')} />;

  const label = {
    scholarship: t.x('Scholarship', 'Buruse'),
    job: t.x('Job', 'Akazi'),
    training: t.x('Training', 'Amahugurwa'),
    announcement: t.x('Announcement', 'Itangazo'),
  };

  return (
    <div className="grid g2">
      {data.map((o) => (
        <div key={o.id} className={`card opp ${o.kind}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <span className="badge b-sky">{label[o.kind] || o.kind}</span>
            <small className="hint">{timeAgo(o.createdAt, a.lang)}</small>
          </div>
          <div className="card-t" style={{ marginTop: 8 }}>
            {o.title}
          </div>
          <div className="meta">
            <span>
              <b>{t.x('Published by', 'Batanze')}:</b> {o.org || '—'}
            </span>
          </div>
          {o.detail && (
            <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>{o.detail}</div>
          )}
        </div>
      ))}
    </div>
  );
}
