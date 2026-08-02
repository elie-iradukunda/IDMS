import { useState } from 'react';
import { XCircle } from 'lucide-react';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { REQ_STATUSES } from '../../lib/constants.js';
import { Card, ReqBadge, Timeline, Empty, Loading, ErrorState } from '../../components/ui.jsx';
import { ConfirmModal } from '../../components/Modal.jsx';

// The provider's own offers only, with limited beneficiary fields. A
// pending offer (still awaiting the officer's decision) can be withdrawn;
// a decided one keeps its history and cannot be retracted.
export default function ProviderOffersPage() {
  const { t } = useUI();
  const { data, loading, error, reload } = useFetch('/provider/offers');
  const m = useMutation({ onDone: reload });
  const [confirm, setConfirm] = useState(null);
  const [status, setStatus] = useState('all');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const rows = (data || []).filter((r) => status === 'all' || r.status === status);

  return (
    <>
      <div className="toolbar">
        <select className="app-select" style={{ maxWidth: 240 }} value={status}
          onChange={(e) => setStatus(e.target.value)} aria-label={t.x('Filter by status', 'Shungura')}>
          <option value="all">{t.x(`All offers (${data?.length || 0})`, `Byose (${data?.length || 0})`)}</option>
          {REQ_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </select>
      </div>

      {rows.length ? (
        <div className="grid g2">
          {rows.map((r) => (
            <Card key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div className="card-t">{r.need}</div>
                <ReqBadge status={r.status} />
              </div>
              <div className="meta">
                <span className="code">{r.code}</span>
                <span><b>{t.x('Beneficiary', 'Uwunguka')}:</b> {r.beneficiary?.code} · {r.beneficiary?.sector}</span>
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
                  <button className="btn red sm" disabled={m.busy} onClick={() => setConfirm(r)}>
                    <XCircle className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Withdraw offer', 'Kuraho igitekerezo')}
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          title={data?.length ? t.x('Nothing matches this filter', 'Nta kiri muri aya mashakiro') : t.x('No offers yet', 'Nta byo waratanga')}
          sub={t.x('Search by recorded need and submit an offer.', 'Shakisha ubukene utange igitekerezo.')}
        />
      )}

      <ConfirmModal
        open={!!confirm} onClose={() => setConfirm(null)} busy={m.busy} tone="red"
        title={t.x(`Withdraw offer ${confirm?.code}?`, `Kuraho ${confirm?.code}?`)}
        message={t.x('The offer is closed as cancelled and the officer no longer has it awaiting a decision. Its timeline is kept, so the record of what was offered survives.',
          'Igitekerezo gihagarikwa kandi umukozi ntakigitegereza. Amateka aguma aho.')}
        confirmLabel={t.x('Withdraw offer', 'Kuraho')}
        onConfirm={() => m.run(() => post(`/support/requests/${confirm.id}/cancel`), {
          success: t.x(`${confirm.code} withdrawn`, `${confirm.code} byahagaritswe`),
          then: () => setConfirm(null),
        })}
      />
    </>
  );
}
