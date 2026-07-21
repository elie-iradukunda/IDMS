import { useState } from 'react';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Card, Badge, ImpairmentTags, Loading, ErrorState } from '../../components/ui.jsx';

// Read-only own record. The authority to change an official record stays
// with the officer, so the record used to allocate support keeps its
// integrity — the beneficiary submits a correction instead.
export default function MyProfilePage() {
  const { t, say } = useUI();
  const { data: me, loading, error, reload } = useFetch('/my/profile');
  const [txt, setTxt] = useState('');
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function submit() {
    if (!txt.trim()) return;
    setBusy(true);
    try {
      await post('/my/corrections', { text: txt.trim() });
      setTxt('');
      setOpen(false);
      setSent(true);
      say(t.x('Correction request sent to your officer', 'Icyifuzo cyo gukosora cyoherejwe ku mukozi'));
    } catch (e) {
      say(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ marginTop: 22, maxWidth: 660 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div className="card-t">
          {me.fullName} <span className="code">{me.code}</span>
        </div>
        <Badge tone={me.verified ? 'green' : 'amber'}>
          {me.verified ? t.x('Verified', 'Byemejwe') : t.x('Unverified', 'Bitemejwe')}
        </Badge>
      </div>
      <div style={{ marginTop: 8 }}>
        <ImpairmentTags list={me.impairments} />
      </div>
      <div className="rec">
        <div className="rl">{t.x('Location', 'Aho aba')}</div>
        <span className="rr">
          {me.sector} · {me.cell} · {me.village}
        </span>
        <div className="rl">{t.x('Daily challenges', 'Ingorane')}</div>
        <span className="rr">{me.dailyChallenges || '—'}</span>
        <div className="rl">{t.x('Support needs', 'Ubufasha akeneye')}</div>
        <span className="rr">{me.supportNeeds}</span>
      </div>
      <small className="hint">
        🔒{' '}
        {t.x(
          'Read-only: the authority to change an official record stays with your officer, so the record used to allocate support keeps its integrity.',
          'Ni uwo kureba gusa: umukozi ni we uhindura inyandiko yemewe.',
        )}
      </small>

      <div className="row-actions">
        <button className="btn ghost sm" onClick={() => setOpen(!open)}>
          ✏️ {t.x('Request a correction', 'Saba gukosora')}
        </button>
      </div>

      {sent && !open && (
        <small className="hint" style={{ display: 'block', marginTop: 10, color: 'var(--green)' }}>
          ✓ {t.x('Your correction request was sent and is awaiting officer review.', 'Icyifuzo cyawe cyoherejwe gitegereje isuzuma.')}
        </small>
      )}

      {open && (
        <div style={{ marginTop: 12 }}>
          <label htmlFor="cx" style={{ fontSize: 13.5, fontWeight: 600 }}>
            {t.x('What is incorrect in your record?', 'Ni iki kitari cyo?')}
          </label>
          <textarea id="cx" className="input" style={{ marginTop: 6 }} value={txt} onChange={(e) => setTxt(e.target.value)} />
          <button className="btn sm" style={{ marginTop: 8 }} disabled={!txt.trim() || busy} onClick={submit}>
            {t('submit')}
          </button>
        </div>
      )}
    </Card>
  );
}
