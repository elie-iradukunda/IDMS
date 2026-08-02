import { useState, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { timeAgo } from '../../lib/format.js';
import { Card, Badge, ImpairmentTags, Loading, ErrorState } from '../../components/ui.jsx';
import { FormModal } from '../../components/Modal.jsx';

// Read-only own record. The authority to change an official record stays
// with the officer, so the record used to allocate support keeps its
// integrity — the beneficiary submits a correction instead. Read access
// with a mediated right of correction is the whole balance: no visibility
// preserves the exclusion, edit rights would destroy the integrity.
export default function MyProfilePage() {
  const { t } = useUI();
  const { data: me, loading, error, reload } = useFetch('/my/profile');
  const [open, setOpen] = useState(false);

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <Card style={{ marginTop: 22, maxWidth: 680 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div className="card-t">{me.fullName} <span className="code">{me.code}</span></div>
          <Badge tone={me.verified ? 'green' : 'amber'}>
            {me.verified ? t.x('Verified', 'Byemejwe') : t.x('Unverified', 'Bitemejwe')}
          </Badge>
        </div>

        <div style={{ marginTop: 8 }}><ImpairmentTags list={me.impairments} /></div>

        <div className="rec">
          <div className="rl">{t.x('Location', 'Aho aba')}</div>
          <span className="rr">{[me.sector, me.cell, me.village].filter(Boolean).join(' · ')}</span>
          <div className="rl">{t.x('Guardian', 'Umurezi')}</div>
          <span className="rr">{me.guardianName || '—'}</span>
          <div className="rl">{t.x('Daily challenges', 'Ingorane')}</div>
          <span className="rr">{me.dailyChallenges || '—'}</span>
          <div className="rl">{t.x('Support needs', 'Ubufasha akeneye')}</div>
          <span className="rr">{me.supportNeeds}</span>
        </div>

        <small className="hint" style={{ display: 'block', marginTop: 12 }}>
          🔒 {t.x(
            'Read-only: the authority to change an official record stays with your officer, so the record used to allocate support keeps its integrity. You can see everything recorded about you and challenge any of it.',
            'Ni uwo kureba gusa: umukozi ni we uhindura inyandiko yemewe. Ushobora kubona byose byanditswe kuri wowe no kubiburana.')}
        </small>

        <div className="row-actions">
          <button className="btn sm" onClick={() => setOpen(true)}>
            <Pencil className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Request a correction', 'Saba gukosora')}
          </button>
        </div>
      </Card>

      <CorrectionHistory key={open ? 'open' : 'closed'} />

      {open && <CorrectionDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function CorrectionDialog({ onClose }) {
  const { t } = useUI();
  const first = useRef(null);
  const [text, setText] = useState('');
  const m = useMutation();

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={t.x('Request a correction', 'Saba gukosora')}
      subtitle={t.x('Tell your officer what is wrong in your record. They review it, and you are emailed whether it was applied or not — an inaccurate record can cost you support you are entitled to, so it matters that you can challenge it.',
        "Bwira umukozi ikitari cyo mu nyandiko yawe. Arabisuzuma, ukamenyeshwa kuri imeyili niba byakosowe.")}
      submitLabel={t.x('Send to my officer', 'Ohereza')}
      onSubmit={() => {
        if (!text.trim()) return m.setError(t.x('Please describe what is incorrect.', 'Nyamuneka sobanura ikitari cyo.'));
        return m.run(() => post('/my/corrections', { text: text.trim() }), {
          success: t.x('Correction request sent to your officer', 'Icyifuzo cyoherejwe ku mukozi'),
          then: onClose,
        });
      }}
    >
      <label className="field-label" htmlFor="corr-text">
        {t.x('What is incorrect in your record?', 'Ni iki kitari cyo mu nyandiko yawe?')} *
      </label>
      <textarea ref={first} id="corr-text" className="app-input" style={{ minHeight: 110 }}
        value={text} onChange={(e) => setText(e.target.value)}
        placeholder={t.x('For example: my village is recorded as Nyakabungo but it is Gasharu.',
          'Urugero: umudugudu wanjye banditse Nyakabungo ariko ni Gasharu.')} />
      <small className="hint">
        {t.x('Say which detail is wrong and what it should be — that is what lets your officer correct it in one step.',
          "Vuga ikintu kitari cyo n'icyo cyagombye kuba — ni byo bituma umukozi abikosora ako kanya.")}
      </small>
    </FormModal>
  );
}

// Showing the outcome of past requests is the part that makes the right of
// correction real: a request that disappears is indistinguishable, to the
// person who made it, from one that was ignored.
function CorrectionHistory() {
  const { t, a } = useUI();
  const { data, loading } = useFetch('/my/corrections');

  if (loading || !data?.length) return null;

  const tone = { PENDING: 'amber', APPLIED: 'green', DECLINED: 'gray' };
  const label = {
    PENDING: t.x('Awaiting review', 'Bitegereje'),
    APPLIED: t.x('Applied to your record', 'Byakosowe'),
    DECLINED: t.x('Reviewed, record unchanged', 'Byasuzumwe, nta mpinduka'),
  };

  return (
    <Card style={{ marginTop: 16, maxWidth: 680 }}>
      <div className="card-t">{t.x('My correction requests', 'Ibyifuzo byanjye byo gukosora')}</div>
      <small className="hint">
        {t.x('Every request you make and the decision on it are recorded here and in the audit log.',
          'Buri cyifuzo n\'icyemezo cyafashweho bikandikwa hano no muri audit log.')}
      </small>
      {data.map((c) => (
        <div key={c.id} className="notif" style={{ alignItems: 'flex-start' }}>
          <div className="notif-ico" aria-hidden="true">✏️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>{c.text}</div>
            <small className="hint">{timeAgo(c.createdAt, a.lang)}</small>
          </div>
          <Badge tone={tone[c.status]}>{label[c.status]}</Badge>
        </div>
      ))}
    </Card>
  );
}
