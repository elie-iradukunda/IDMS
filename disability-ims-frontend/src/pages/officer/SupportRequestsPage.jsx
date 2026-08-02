import { useState, useRef } from 'react';
import { Pencil, Gavel, Truck, PackageCheck, XCircle } from 'lucide-react';
import { post, patch, qs } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { REQ_STATUSES } from '../../lib/constants.js';
import { Card, ReqBadge, Timeline, Empty, Loading, ErrorState } from '../../components/ui.jsx';
import { FormModal, ConfirmModal } from '../../components/Modal.jsx';

// Coordinate support. Every officer decision must carry a recorded reason
// (shown to the beneficiary and emailed to them): a decision that must be
// explained is a decision that must be justifiable.
export default function SupportRequestsPage() {
  const { t } = useUI();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState(null);   // { kind, r, decision? }

  const { data, loading, error, reload } = useFetch(`/support/requests${qs({ status, q })}`);

  const close = () => setDialog(null);
  const done = () => { close(); reload(); };

  return (
    <>
      <div className="toolbar">
        <div className="grow">
          <label htmlFor="rq" className="sr-only">{t.x('Search requests', 'Shakisha ibyifuzo')}</label>
          <input id="rq" className="input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t.x('Search by code, need or beneficiary…', 'Shakisha code, ubufasha, uwunguka…')} />
        </div>
        <select className="app-select" style={{ maxWidth: 230 }} value={status}
          onChange={(e) => setStatus(e.target.value)} aria-label={t.x('Filter by status', 'Shungura')}>
          <option value="all">{t.x('All statuses', 'Byose')}</option>
          {REQ_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </select>
      </div>

      {loading ? <Loading />
        : error ? <ErrorState error={error} onRetry={reload} />
        : data?.length ? (
          <>
            <p className="page-sub" style={{ marginTop: 14 }} role="status">
              {t.x(`${data.length} request(s)`, `Ibyifuzo ${data.length}`)}
            </p>
            <div className="grid g2">
              {data.map((r) => (
                <ReqCard key={r.id} r={r} onAction={(kind, decision) => setDialog({ kind, r, decision })} />
              ))}
            </div>
          </>
        ) : (
          <Empty
            title={t.x('No support requests', 'Nta byifuzo')}
            sub={t.x('Nothing matches the current filter.', 'Nta kiri muri aya mashakiro.')}
          />
        )}

      {dialog?.kind === 'decide' && <DecideDialog r={dialog.r} decision={dialog.decision} onClose={close} onDone={done} />}
      {dialog?.kind === 'edit' && <EditNeedDialog r={dialog.r} onClose={close} onDone={done} />}
      {dialog?.kind === 'advance' && <AdvanceDialog r={dialog.r} step={dialog.decision} onClose={close} onDone={done} />}
      {dialog?.kind === 'cancel' && <CancelDialog r={dialog.r} onClose={close} onDone={done} />}
    </>
  );
}

const ORIGIN_LABEL = (t, r) => ({
  PROVIDER: `${t.x('Provider offer', 'Provider')} — ${r.provider?.name || '—'}`,
  BENEFICIARY: t.x('Requested by the beneficiary', 'Uwunguka yasabye'),
  OFFICER: t.x('Officer-initiated', 'Umukozi'),
}[r.origin]);

function ReqCard({ r, onAction }) {
  const { t } = useUI();
  const b = r.beneficiary;
  const approved = ['APPROVED_URGENT', 'APPROVED_STANDARD'].includes(r.status);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div className="card-t">{r.need} <span className="code">{r.code}</span></div>
        <ReqBadge status={r.status} />
      </div>
      <div className="meta">
        <span><b>{t.x('Beneficiary', 'Uwunguka')}:</b> {b?.fullName} ({b?.code})</span>
        <span><b>{t.x('Origin', 'Aho byavuye')}:</b> {ORIGIN_LABEL(t, r)}</span>
      </div>

      {r.decisionReason && (
        <div className="rec">
          <div className="rl">{t.x('Recorded decision reason', 'Impamvu yanditse')}</div>
          {r.decisionReason}
        </div>
      )}

      {r.status === 'REQUESTED' && (
        <div className="row-actions">
          <button className="btn red sm" onClick={() => onAction('decide', 'urgent')}>
            <Gavel className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Approve · Urgent', 'Emeza · Byihutirwa')}
          </button>
          <button className="btn sm" onClick={() => onAction('decide', 'standard')}>
            {t.x('Approve · Standard', 'Emeza · Bisanzwe')}
          </button>
          <button className="btn ghost sm" onClick={() => onAction('decide', 'ineligible')}>
            {t.x('Not eligible', 'Ntibyemewe')}
          </button>
          <button className="btn ghost sm" onClick={() => onAction('edit')}>
            <Pencil className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Edit need', 'Hindura')}
          </button>
          <button className="btn ghost sm" onClick={() => onAction('cancel')}>
            <XCircle className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Cancel', 'Hagarika')}
          </button>
        </div>
      )}

      {approved && (
        <div className="row-actions">
          <button className="btn sm" onClick={() => onAction('advance', 'distribute')}>
            <Truck className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Start distribution', 'Tangira gutanga')}
          </button>
        </div>
      )}

      {r.status === 'DISTRIBUTING' && (
        <div className="row-actions">
          <button className="btn green sm" onClick={() => onAction('advance', 'complete')}>
            <PackageCheck className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Confirm delivery', 'Emeza ko byatanzwe')}
          </button>
        </div>
      )}

      <Timeline items={r.timeline} />
    </Card>
  );
}

// ── The decision, with its mandatory reason ──────────────────
function DecideDialog({ r, decision, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const [reason, setReason] = useState('');
  const m = useMutation();

  const meta = {
    urgent: {
      title: t.x(`Approve ${r.code} as urgent`, `Emeza ${r.code} byihutirwa`),
      label: t.x('Approve · Urgent', 'Emeza · Byihutirwa'),
      hint: t.x('Escalates this request for priority support ahead of the standard queue.',
        'Bishyirwa imbere y\'ibindi.'),
    },
    standard: {
      title: t.x(`Approve ${r.code}`, `Emeza ${r.code}`),
      label: t.x('Approve · Standard', 'Emeza · Bisanzwe'),
      hint: t.x('Queues this request for scheduled distribution.', 'Bishyirwa ku rutonde rusanzwe.'),
    },
    ineligible: {
      title: t.x(`Record ${r.code} as not eligible`, `Andika ${r.code} nk'ibitemewe`),
      label: t.x('Record as not eligible', 'Andika ko bitemewe'),
      hint: t.x('The beneficiary sees this reason and can challenge the record it was based on.',
        'Uwunguka arabona iyi mpamvu kandi ashobora kuyiburana.'),
    },
  }[decision];

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={meta.title}
      subtitle={t.x('A reason is required and is shown to the beneficiary in the app and by email. A decision that must be explained is a decision that must be justifiable.',
        'Impamvu irakenewe kandi uwunguka arayibona muri sisitemu no kuri imeyili.')}
      submitLabel={meta.label}
      onSubmit={() => {
        if (!reason.trim()) {
          return m.setError(t.x('A decision reason is required and is shown to the beneficiary.',
            'Impamvu irakenewe kandi uwunguka arayibona.'));
        }
        return m.run(() => post(`/support/requests/${r.id}/decide`, { decision, reason: reason.trim() }), {
          success: t.x(`${r.code} — decision recorded`, `${r.code} — icyemezo cyanditswe`),
          then: onDone,
        });
      }}
    >
      <div className="modal-current">
        <div className="rl">{t.x('Request', 'Icyifuzo')}</div>
        {r.need}
        <div className="rl" style={{ marginTop: 10 }}>{t.x('Beneficiary', 'Uwunguka')}</div>
        {r.beneficiary?.fullName} ({r.beneficiary?.code}) · {r.beneficiary?.sector}
        <div className="rl" style={{ marginTop: 10 }}>{t.x('Origin', 'Aho byavuye')}</div>
        {ORIGIN_LABEL(t, r)}
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="field-label" htmlFor="d-reason">{t.x('Decision reason', 'Impamvu')} *</label>
        <textarea
          ref={first} id="d-reason" className="app-input" style={{ minHeight: 96 }}
          value={reason} onChange={(e) => { setReason(e.target.value); m.reset(); }}
          placeholder={t.x('Why is this approved, prioritised or declined?', 'Kuki byemejwe cyangwa byanzwe?')}
        />
        <small className="hint">{meta.hint}</small>
      </div>
    </FormModal>
  );
}

function EditNeedDialog({ r, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const [need, setNeed] = useState(r.need);
  const m = useMutation();
  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={t.x(`Edit request ${r.code}`, `Hindura ${r.code}`)}
      subtitle={t.x('Only a request still awaiting a decision can be edited, and the revision is recorded on its timeline.',
        'Ibyifuzo bitarafatirwa icyemezo gusa ni byo bihindurwa.')}
      submitLabel={t.x('Save', 'Bika')}
      onSubmit={() => {
        if (!need.trim()) return m.setError(t.x('The support need is required.', 'Ubufasha burakenewe.'));
        return m.run(() => patch(`/support/requests/${r.id}`, { need: need.trim() }), {
          success: t.x('Request updated', 'Byavuguruwe'), then: onDone,
        });
      }}
    >
      <label className="field-label" htmlFor="en-need">{t.x('Support need', 'Ubufasha bukenewe')} *</label>
      <textarea ref={first} id="en-need" className="app-input" style={{ minHeight: 90 }}
        value={need} onChange={(e) => setNeed(e.target.value)} />
    </FormModal>
  );
}

function AdvanceDialog({ r, step, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  const meta = {
    distribute: {
      title: t.x(`Start distribution of ${r.code}`, `Tangira gutanga ${r.code}`),
      message: t.x('This records that distribution has begun with the provider, and notifies the beneficiary in the app and by email.',
        'Byandika ko gutanga byatangiye kandi uwunguka aramenyeshwa.'),
      label: t.x('Start distribution', 'Tangira'),
      tone: '',
    },
    complete: {
      title: t.x(`Confirm delivery of ${r.code}`, `Emeza ko ${r.code} byatanzwe`),
      message: t.x('This confirms the support was received and stores it permanently in the beneficiary\'s support history. It cannot be undone.',
        "Byemeza ko ubufasha bwakiriwe kandi bikandikwa mu mateka. Ntibisubirwaho."),
      label: t.x('Confirm delivery', 'Emeza'),
      tone: 'green',
    },
  }[step];

  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone={meta.tone || 'green'}
      title={meta.title} message={meta.message} confirmLabel={meta.label}
      onConfirm={() => m.run(() => post(`/support/requests/${r.id}/${step}`), {
        success: t.x(`${r.code} updated`, `${r.code} byavuguruwe`), then: onDone,
      })}
    />
  );
}

function CancelDialog({ r, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone="red"
      title={t.x(`Cancel request ${r.code}?`, `Guhagarika ${r.code}?`)}
      message={t.x('The request is closed as cancelled and the beneficiary is notified. Its timeline is kept, so the record of what was asked and withdrawn survives.',
        'Icyifuzo gihagarikwa kandi uwunguka aramenyeshwa. Amateka aguma aho.')}
      confirmLabel={t.x('Cancel request', 'Hagarika')}
      onConfirm={() => m.run(() => post(`/support/requests/${r.id}/cancel`), {
        success: t.x(`${r.code} cancelled`, `${r.code} byahagaritswe`), then: onDone,
      })}
    />
  );
}
