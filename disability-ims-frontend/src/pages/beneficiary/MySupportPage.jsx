import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Card, ReqBadge, Timeline, Empty, Loading, ErrorState } from '../../components/ui.jsx';

// The beneficiary's own support requests, with the officer's recorded
// reason and the full timeline (support history is preserved).
export default function MySupportPage() {
  const { t } = useUI();
  const { data, loading, error, reload } = useFetch('/my/support');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.length) return <Empty title={t.x('No support requests yet', 'Nta byifuzo')} />;

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
            {r.provider?.name && (
              <span>
                <b>{t.x('Provider', 'Utanga')}:</b> {r.provider.name}
              </span>
            )}
          </div>
          {r.decisionReason && (
            <div className="rec">
              <div className="rl">{t.x('Reason recorded by the officer', "Impamvu y'umukozi")}</div>
              {r.decisionReason}
            </div>
          )}
          <Timeline items={r.timeline} />
        </Card>
      ))}
    </div>
  );
}
