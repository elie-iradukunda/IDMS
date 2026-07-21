import { useState } from 'react';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Card, ReqBadge, Timeline, Empty, Loading, ErrorState } from '../../components/ui.jsx';

// Coordinate support. Every officer decision must carry a recorded reason
// (shown to the beneficiary): a decision that must be explained is a
// decision that must be justifiable.
export default function SupportRequestsPage() {
  const { t } = useUI();
  const { data, loading, error, reload } = useFetch('/support/requests');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.length) return <Empty title={t.x('No support requests', 'Nta byifuzo')} />;

  return (
    <div className="grid g2">
      {data.map((r) => (
        <OfficerReq key={r.id} r={r} reload={reload} />
      ))}
    </div>
  );
}

function OfficerReq({ r, reload }) {
  const { t, say } = useUI();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(fn, msg) {
    setBusy(true);
    try {
      await fn();
      if (msg) say(msg);
      reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function decide(decision) {
    if (!reason.trim()) {
      setErr(t.x('A decision reason is required and is shown to the beneficiary.', 'Impamvu irakenewe kandi uwunguka arayibona.'));
      return;
    }
    run(() => post(`/support/requests/${r.id}/decide`, { decision, reason: reason.trim() }), t.x(`${r.code} — decision recorded`, `${r.code} — icyemezo cyanditswe`));
  }

  const b = r.beneficiary;
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div className="card-t">
          {r.need} <span className="code">{r.code}</span>
        </div>
        <ReqBadge status={r.status} />
      </div>
      <div className="meta">
        <span>
          <b>{t.x('Beneficiary', 'Uwunguka')}:</b> {b?.fullName} ({b?.code})
        </span>
        <span>
          <b>{t.x('Origin', 'Aho byavuye')}:</b>{' '}
          {r.origin === 'PROVIDER' ? `${t.x('Provider offer', 'Provider')} — ${r.provider?.name || ''}` : t.x('Officer-initiated', 'Umukozi')}
        </span>
      </div>
      {r.decisionReason && (
        <div className="rec">
          <div className="rl">{t.x('Recorded decision reason', 'Impamvu yanditse')}</div>
          {r.decisionReason}
        </div>
      )}

      {r.status === 'REQUESTED' && (
        <>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 13.5, fontWeight: 600 }}>{t.x('Decision reason (required)', 'Impamvu (itegetswe)')}</label>
            <textarea
              className="input"
              style={{ minHeight: 62, marginTop: 6 }}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setErr('');
              }}
              placeholder={t.x('Why is this approved, prioritised or declined?', 'Kuki byemejwe cyangwa byanzwe?')}
            />
            {err && (
              <div className="err" role="alert">
                {err}
              </div>
            )}
          </div>
          <div className="row-actions">
            <button className="btn red sm" onClick={() => decide('urgent')} disabled={busy}>
              {t.x('Approve · Urgent', 'Emeza · Byihutirwa')}
            </button>
            <button className="btn sm" onClick={() => decide('standard')} disabled={busy}>
              {t.x('Approve · Standard', 'Emeza · Bisanzwe')}
            </button>
            <button className="btn ghost sm" onClick={() => decide('ineligible')} disabled={busy}>
              {t.x('Not eligible', 'Ntibyemewe')}
            </button>
            <button
              className="btn ghost sm"
              disabled={busy}
              onClick={() => run(() => post(`/support/requests/${r.id}/cancel`), t.x(`${r.code} cancelled`, `${r.code} byahagaritswe`))}
            >
              {t.x('Cancel', 'Hagarika')}
            </button>
          </div>
        </>
      )}

      {['APPROVED_URGENT', 'APPROVED_STANDARD'].includes(r.status) && (
        <div className="row-actions">
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => run(() => post(`/support/requests/${r.id}/distribute`), t.x(`${r.code} — distributing`, `${r.code} — biratangwa`))}
          >
            {t.x('Start distribution', 'Tangira gutanga')}
          </button>
        </div>
      )}

      {r.status === 'DISTRIBUTING' && (
        <div className="row-actions">
          <button
            className="btn green sm"
            disabled={busy}
            onClick={() => run(() => post(`/support/requests/${r.id}/complete`), t.x(`${r.code} — completed`, `${r.code} — byarangiye`))}
          >
            {t.x('Confirm delivery', 'Emeza ko byatanzwe')}
          </button>
        </div>
      )}

      <Timeline items={r.timeline} />
    </Card>
  );
}
