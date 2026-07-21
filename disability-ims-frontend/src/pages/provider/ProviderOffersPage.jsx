import { useState } from 'react';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Card, ReqBadge, Timeline, Empty, Loading, ErrorState } from '../../components/ui.jsx';

// The provider's own offers only, with limited beneficiary fields. A pending
// offer (still awaiting the officer's decision) can be withdrawn.
export default function ProviderOffersPage() {
  const { t, say } = useUI();
  const { data, loading, error, reload } = useFetch('/provider/offers');
  const [busy, setBusy] = useState(null);

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.length)
    return (
      <Empty
        title={t.x('No offers yet', 'Nta byo waratanga')}
        sub={t.x('Search by need and submit an offer.', 'Shakisha utange igitekerezo.')}
      />
    );

  async function cancel(r) {
    setBusy(r.id);
    try {
      await post(`/support/requests/${r.id}/cancel`);
      say(t.x(`${r.code} withdrawn`, `${r.code} byahagaritswe`));
      reload();
    } catch (e) { say(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="grid g2">
      {data.map((r) => (
        <Card key={r.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div className="card-t">{r.need}</div>
            <ReqBadge status={r.status} />
          </div>
          <div className="meta">
            <span className="code">{r.code}</span>
            <span>
              <b>{t.x('Beneficiary', 'Uwunguka')}:</b> {r.beneficiary?.code} · {r.beneficiary?.sector}
            </span>
          </div>
          {r.decisionReason && (
            <div className="rec">
              <div className="rl">{t.x('Officer decision', 'Icyemezo')}</div>
              {r.decisionReason}
            </div>
          )}
          <Timeline items={r.timeline} />
          {r.status === 'REQUESTED' && (
            <div className="row-actions">
              <button className="btn red sm" disabled={busy === r.id} onClick={() => cancel(r)}>
                {t.x('Withdraw offer', 'Kuraho igitekerezo')}
              </button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
