import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Card, Loading, ErrorState } from '../../components/ui.jsx';
import { timeAgo } from '../../lib/format.js';

// In-app notifications (support updates, published opportunities). Tapping
// an unread message marks it read.
export default function MessagesPage() {
  const { t, a } = useUI();
  const { data, loading, error, reload } = useFetch('/my/notifications');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function markRead(n) {
    if (n.read) return;
    try {
      await post(`/my/notifications/${n.id}/read`);
      reload();
    } catch {
      /* non-critical */
    }
  }

  return (
    <Card style={{ marginTop: 22 }}>
      {data?.length ? (
        data.map((n) => (
          <button
            key={n.id}
            className="notif"
            onClick={() => markRead(n)}
            style={{
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              opacity: n.read ? 0.6 : 1,
            }}
          >
            <div className="notif-ico">{n.icon || '🔔'}</div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{n.message}</div>
              <small className="hint">
                {timeAgo(n.createdAt, a.lang)}
                {!n.read && ` · ${t.x('new', 'gishya')}`}
              </small>
            </div>
          </button>
        ))
      ) : (
        <div style={{ color: 'var(--muted)', padding: 8 }}>{t.x('No messages.', 'Nta butumwa.')}</div>
      )}
    </Card>
  );
}
