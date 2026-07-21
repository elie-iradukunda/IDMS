import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Card, Loading, ErrorState } from '../../components/ui.jsx';
import { timeAgo } from '../../lib/format.js';

// Every action on a record is logged: an inaccurate registry causes real
// harm to a real person, so changes must be attributable.
export default function AuditPage() {
  const { t, a } = useUI();
  const { data, loading, error, reload } = useFetch('/admin/audit');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <Card style={{ marginTop: 22 }}>
      <small className="hint">
        {t.x(
          'Every action on a record is logged: an inaccurate registry causes real harm to a real person, so changes must be attributable.',
          'Buri gikorwa kirandikwa.',
        )}
      </small>
      {(data || []).map((x) => (
        <div key={x.id} className="notif">
          <div className="notif-ico">📝</div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{x.action}</div>
            <small className="hint">
              {x.actorName} · {timeAgo(x.createdAt, a.lang)}
            </small>
          </div>
        </div>
      ))}
    </Card>
  );
}
