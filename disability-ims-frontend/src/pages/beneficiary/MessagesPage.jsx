import { useState } from 'react';
import { CheckCheck, Trash2 } from 'lucide-react';
import { post, del } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { Card, Badge, Empty, Loading, ErrorState } from '../../components/ui.jsx';
import { ConfirmModal } from '../../components/Modal.jsx';
import { timeAgo } from '../../lib/format.js';

// In-app notifications (support updates, published opportunities). The same
// events are also emailed where an address is on file — the requirement is
// "by email or message", because a beneficiary without a device still has to
// be reachable, and one without email still has to be told.
export default function MessagesPage() {
  const { t, a } = useUI();
  const { data, loading, error, reload } = useFetch('/my/notifications');
  const m = useMutation({ onDone: reload });
  const [confirm, setConfirm] = useState(null);
  const [filter, setFilter] = useState('all');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const all = data || [];
  const unread = all.filter((n) => !n.read);
  const rows = filter === 'unread' ? unread : all;

  return (
    <>
      <div className="toolbar">
        <select className="app-select" style={{ maxWidth: 220 }} value={filter}
          onChange={(e) => setFilter(e.target.value)} aria-label={t.x('Filter messages', 'Shungura ubutumwa')}>
          <option value="all">{t.x(`All messages (${all.length})`, `Ubutumwa bwose (${all.length})`)}</option>
          <option value="unread">{t.x(`Unread (${unread.length})`, `Butarasomwa (${unread.length})`)}</option>
        </select>
        <button className="btn ghost sm" disabled={!unread.length || m.busy}
          onClick={() => m.run(() => post('/my/notifications/read-all'), {
            success: t.x('All messages marked read', 'Byose byashyizwe ku byasomwe'), silent: true,
          })}>
          <CheckCheck className="h-[15px] w-[15px]" aria-hidden="true" /> {t.x('Mark all read', 'Byose byasomwe')}
        </button>
      </div>

      <Card style={{ marginTop: 16 }}>
        {rows.length ? rows.map((n) => (
          <div key={n.id} className="notif" style={{ opacity: n.read ? 0.68 : 1, alignItems: 'flex-start' }}>
            <div className="notif-ico" aria-hidden="true">{n.icon || '🔔'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.45 }}>{n.message}</div>
              <small className="hint">{timeAgo(n.createdAt, a.lang)}</small>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {!n.read && (
                <>
                  <Badge tone="green">{t.x('New', 'Gishya')}</Badge>
                  <button className="btn ghost sm" disabled={m.busy}
                    aria-label={t.x('Mark this message read', 'Shyira ku byasomwe')}
                    onClick={() => m.run(() => post(`/my/notifications/${n.id}/read`), { silent: true })}>
                    <CheckCheck className="h-[14px] w-[14px]" aria-hidden="true" />
                  </button>
                </>
              )}
              <button className="btn red sm" disabled={m.busy}
                aria-label={t.x('Delete this message', 'Siba ubu butumwa')}
                onClick={() => setConfirm(n)}>
                <Trash2 className="h-[14px] w-[14px]" aria-hidden="true" />
              </button>
            </div>
          </div>
        )) : (
          <Empty
            title={filter === 'unread' ? t.x('Nothing unread', 'Nta butumwa bushya') : t.x('No messages', 'Nta butumwa')}
            sub={t.x('Updates about your support requests and new opportunities appear here.',
              "Amakuru ku byifuzo byawe n'amahirwe mashya azagaragara hano.")}
          />
        )}
      </Card>

      <ConfirmModal
        open={!!confirm} onClose={() => setConfirm(null)} busy={m.busy} tone="red"
        title={t.x('Delete this message?', 'Gusiba ubu butumwa?')}
        message={t.x('It is removed from your inbox. The underlying support request or opportunity is not affected, and the record of it stays in the system.',
          "Bukurwa mu butumwa bwawe. Icyifuzo cyangwa amahirwe biguma aho.")}
        confirmLabel={t.x('Delete', 'Siba')}
        onConfirm={() => m.run(() => del(`/my/notifications/${confirm.id}`), {
          success: t.x('Message deleted', 'Bwasibwe'), then: () => setConfirm(null),
        })}
      />
    </>
  );
}
