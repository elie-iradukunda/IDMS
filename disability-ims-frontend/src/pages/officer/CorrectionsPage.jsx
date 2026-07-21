import { useState } from 'react';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Card, Badge, Empty, Loading, ErrorState } from '../../components/ui.jsx';

// Fields an officer may set when applying a correction (backend field names).
const FIELDS = {
  village: ['Village', 'Umudugudu'],
  cell: ['Cell', 'Akagari'],
  sector: ['Sector', 'Umurenge'],
  guardianName: ['Guardian', 'Umurezi'],
  dailyChallenges: ['Daily challenges', 'Ingorane'],
  supportNeeds: ['Support needs', 'Ubufasha akeneye'],
};

// The beneficiary may see everything and challenge it, but only an officer
// may change the official record — and both the request and the decision
// are logged.
export default function CorrectionsPage() {
  const { t } = useUI();
  const { data, loading, error, reload } = useFetch('/corrections?status=PENDING');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.length) return <Empty title={t.x('No correction requests', 'Nta byo gukosora')} />;

  return (
    <div className="grid g2">
      {data.map((c) => (
        <CorrectionCard key={c.id} c={c} reload={reload} />
      ))}
    </div>
  );
}

function CorrectionCard({ c, reload }) {
  const { t, say } = useUI();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState('village');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function resolve(apply, patch) {
    setBusy(true);
    try {
      await post(`/corrections/${c.id}/resolve`, { apply, patch });
      say(apply ? t.x('Correction applied', 'Byakosowe') : t.x('Correction declined', 'Byanzwe'));
      reload();
    } catch (e) {
      say(e.message);
    } finally {
      setBusy(false);
    }
  }

  const b = c.beneficiary;
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div className="card-t">
          {b?.fullName} <span className="code">{b?.code}</span>
        </div>
        <Badge tone="amber">{t.x('Pending', 'Bitegereje')}</Badge>
      </div>
      <div className="rec">
        <div className="rl">{t.x('Requested correction', 'Icyo asaba')}</div>
        {c.text}
      </div>

      <small className="hint">
        🔐{' '}
        {t.x(
          'The beneficiary may see and challenge the record, but only an officer may change it — and both the request and the change are logged.',
          'Uwunguka areba akanaburana, ariko umukozi ni we uhindura; byose birandikwa.',
        )}
      </small>

      {open ? (
        <div style={{ marginTop: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 11, padding: 12 }}>
          <div className="rl">{t.x('Which field, and what should it become?', 'Ni ikihe gice, kigire iki?')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, marginTop: 8 }}>
            <select className="input" value={field} onChange={(e) => setField(e.target.value)} aria-label="Field to correct">
              {Object.entries(FIELDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {t.x(v[0], v[1])}
                </option>
              ))}
            </select>
            <input className="input" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Corrected value" />
          </div>
          <div className="row-actions">
            <button className="btn green sm" disabled={!value.trim() || busy} onClick={() => resolve(true, { [field]: value.trim() })}>
              {t.x('Confirm & update record', 'Emeza uhindure')}
            </button>
            <button className="btn ghost sm" onClick={() => setOpen(false)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="row-actions">
          <button className="btn green sm" onClick={() => setOpen(true)}>
            {t.x('Apply to record', 'Kosora')}
          </button>
          <button className="btn red sm" disabled={busy} onClick={() => resolve(false, {})}>
            {t.x('Decline', 'Anga')}
          </button>
        </div>
      )}
    </Card>
  );
}
