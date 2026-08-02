import { useState, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { SECTORS } from '../../lib/constants.js';
import { timeAgo } from '../../lib/format.js';
import { Card, Badge, Empty, Loading, ErrorState } from '../../components/ui.jsx';
import { FormModal, ConfirmModal } from '../../components/Modal.jsx';

// Fields an officer may set when applying a correction (backend field names).
// These are exactly the fields the backend will accept, so the dialog cannot
// offer a change the API would then refuse.
const FIELDS = {
  fullName:        ['Full name', 'Amazina'],
  nationalId:      ['National ID', 'Indangamuntu'],
  village:         ['Village', 'Umudugudu'],
  cell:            ['Cell', 'Akagari'],
  sector:          ['Sector', 'Umurenge'],
  guardianName:    ['Guardian', 'Umurezi'],
  email:           ['Email', 'Imeyili'],
  dailyChallenges: ['Daily challenges', 'Ingorane'],
  supportNeeds:    ['Support needs', 'Ubufasha akeneye'],
};
const LONG = ['dailyChallenges', 'supportNeeds'];

const STATUS_TONE = { PENDING: 'amber', APPLIED: 'green', DECLINED: 'gray' };

// The beneficiary may see everything and challenge it, but only an officer
// may change the official record — and both the request and the decision
// are logged and emailed back to the person who raised it.
export default function CorrectionsPage() {
  const { t } = useUI();
  const [status, setStatus] = useState('PENDING');
  const [dialog, setDialog] = useState(null);   // { kind, c }
  const { data, loading, error, reload } = useFetch(`/corrections?status=${status}`);

  const close = () => setDialog(null);
  const done = () => { close(); reload(); };

  return (
    <>
      <div className="toolbar">
        <select className="app-select" style={{ maxWidth: 240 }} value={status}
          onChange={(e) => setStatus(e.target.value)} aria-label={t.x('Filter corrections', 'Shungura')}>
          <option value="PENDING">{t.x('Awaiting review', 'Bitegereje')}</option>
          <option value="APPLIED">{t.x('Applied', 'Byakosowe')}</option>
          <option value="DECLINED">{t.x('Declined', 'Byanzwe')}</option>
          <option value="all">{t.x('All correction history', 'Amateka yose')}</option>
        </select>
      </div>

      {loading ? <Loading />
        : error ? <ErrorState error={error} onRetry={reload} />
        : data?.length ? (
          <div className="grid g2">
            {data.map((c) => <CorrCard key={c.id} c={c} onAction={(kind) => setDialog({ kind, c })} />)}
          </div>
        ) : (
          <Empty
            title={t.x('No correction requests', 'Nta byo gukosora')}
            sub={status === 'PENDING'
              ? t.x('Nothing is currently awaiting your review.', 'Nta kigutegereje.')
              : t.x('Nothing matches this filter.', 'Nta kiri muri aya mashakiro.')}
          />
        )}

      {dialog?.kind === 'apply' && <ApplyDialog c={dialog.c} onClose={close} onDone={done} />}
      {dialog?.kind === 'decline' && <DeclineDialog c={dialog.c} onClose={close} onDone={done} />}
    </>
  );
}

function CorrCard({ c, onAction }) {
  const { t, a } = useUI();
  const b = c.beneficiary;
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div className="card-t">{b?.fullName} <span className="code">{b?.code}</span></div>
        <Badge tone={STATUS_TONE[c.status]}>
          {t.x(
            { PENDING: 'Pending', APPLIED: 'Applied', DECLINED: 'Declined' }[c.status],
            { PENDING: 'Bitegereje', APPLIED: 'Byakosowe', DECLINED: 'Byanzwe' }[c.status],
          )}
        </Badge>
      </div>

      <div className="rec">
        <div className="rl">{t.x('Requested correction', 'Icyo asaba')}</div>
        {c.text}
      </div>
      <small className="hint" style={{ display: 'block', marginTop: 8 }}>
        {t.x('Submitted', 'Cyoherejwe')} {timeAgo(c.createdAt, a.lang)}
        {b?.sector ? ` · ${b.sector}` : ''}
      </small>

      {c.status === 'PENDING' && (
        <>
          <small className="hint" style={{ display: 'block', marginTop: 10 }}>
            🔐 {t.x(
              'The beneficiary may see and challenge the record, but only an officer may change it — and both the request and the change are logged.',
              'Uwunguka areba akanaburana, ariko umukozi ni we uhindura; byose birandikwa.')}
          </small>
          <div className="row-actions">
            <button className="btn green sm" onClick={() => onAction('apply')}>
              <Check className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Apply to record', 'Kosora')}
            </button>
            <button className="btn red sm" onClick={() => onAction('decline')}>
              <X className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Decline', 'Anga')}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Apply the correction to the official record ──────────────
function ApplyDialog({ c, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const [field, setField] = useState('village');
  const [value, setValue] = useState('');
  const m = useMutation();
  const b = c.beneficiary;

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={t.x(`Correct the record for ${b?.code}`, `Kosora inyandiko ya ${b?.code}`)}
      subtitle={t.x('Choose the field the beneficiary is challenging and the value it should become. The change, the previous value and your name are written to the audit log, and the beneficiary is emailed the outcome.',
        "Hitamo igice n'agaciro gashya. Impinduka yandikwa muri audit log kandi uwunguka aramenyeshwa.")}
      submitLabel={t.x('Confirm & update record', 'Emeza uhindure')}
      onSubmit={() => {
        if (!value.trim()) {
          return m.setError(t.x('Enter the corrected value.', 'Andika agaciro gakosowe.'));
        }
        return m.run(() => post(`/corrections/${c.id}/resolve`, { apply: true, patch: { [field]: value.trim() } }), {
          success: t.x('Correction applied', 'Byakosowe'), then: onDone,
        });
      }}
    >
      <div className="modal-current">
        <div className="rl">{t.x('The beneficiary reported', 'Icyo yavuze')}</div>
        {c.text}
      </div>

      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="cf-field">{t.x('Field to correct', 'Igice')} *</label>
          <select ref={first} id="cf-field" className="app-select" value={field}
            onChange={(e) => { setField(e.target.value); setValue(''); m.reset(); }}>
            {Object.entries(FIELDS).map(([k, v]) => <option key={k} value={k}>{t.x(v[0], v[1])}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="cf-value">{t.x('Corrected value', 'Agaciro gashya')} *</label>
          {field === 'sector' ? (
            <select id="cf-value" className="app-select" value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">{t.x('Select…', 'Hitamo…')}</option>
              {SECTORS.map((s) => <option key={s}>{s}</option>)}
            </select>
          ) : (
            <input id="cf-value" className="app-input" value={value}
              type={field === 'email' ? 'email' : 'text'}
              onChange={(e) => setValue(e.target.value)} />
          )}
        </div>
        {LONG.includes(field) && (
          <div className="full">
            <label className="field-label" htmlFor="cf-long">{t.x('Full text', 'Inyandiko yuzuye')}</label>
            <textarea id="cf-long" className="app-input" style={{ minHeight: 84 }}
              value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        )}
      </div>
    </FormModal>
  );
}

function DeclineDialog({ c, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone="red"
      title={t.x('Decline this correction?', 'Kwanga iki cyifuzo?')}
      message={t.x('The official record is left unchanged and the beneficiary is told their request was reviewed, so they can submit a clearer one rather than being left without an answer.',
        'Inyandiko ntihinduka kandi uwunguka aramenyeshwa ko cyasuzumwe.')}
      confirmLabel={t.x('Decline correction', 'Anga')}
      onConfirm={() => m.run(() => post(`/corrections/${c.id}/resolve`, { apply: false }), {
        success: t.x('Correction declined', 'Byanzwe'), then: onDone,
      })}
    />
  );
}
