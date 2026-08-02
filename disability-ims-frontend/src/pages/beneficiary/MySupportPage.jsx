import { useState, useRef } from 'react';
import { HandHeart, XCircle } from 'lucide-react';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { Card, ReqBadge, Timeline, Empty, Loading, ErrorState } from '../../components/ui.jsx';
import { FormModal, ConfirmModal } from '../../components/Modal.jsx';

// The beneficiary's own support requests, with the officer's recorded
// reason and the full timeline — and the ability to ask for support
// themselves. A system that records what a person needs but gives them no
// way to say so leaves them dependent on being noticed.
export default function MySupportPage() {
  const { t } = useUI();
  const { data, loading, error, reload } = useFetch('/my/support');
  const profile = useFetch('/my/profile');
  const [dialog, setDialog] = useState(null);

  const close = () => setDialog(null);
  const done = () => { close(); reload(); };

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <div className="toolbar">
        <button className="app-button" onClick={() => setDialog({ kind: 'ask' })}>
          <HandHeart className="h-[16px] w-[16px]" aria-hidden="true" style={{ marginRight: 7 }} />
          {t.x('Request support', 'Saba ubufasha')}
        </button>
      </div>

      {data?.length ? (
        <div className="grid g2">
          {data.map((r) => (
            <Card key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div className="card-t">{r.need}</div>
                <ReqBadge status={r.status} />
              </div>
              <div className="meta">
                <span className="code">{r.code}</span>
                {r.origin === 'BENEFICIARY' && <span>{t.x('You asked for this', 'Wowe wabisabye')}</span>}
                {r.origin === 'OFFICER' && <span>{t.x('Raised by your officer', "Umukozi w'akarere")}</span>}
                {r.provider?.name && <span><b>{t.x('Provider', 'Utanga')}:</b> {r.provider.name}</span>}
              </div>
              {r.decisionReason && (
                <div className="rec">
                  <div className="rl">{t.x('Reason recorded by the officer', "Impamvu y'umukozi")}</div>
                  {r.decisionReason}
                </div>
              )}
              <Timeline items={r.timeline} />
              {r.status === 'REQUESTED' && r.origin === 'BENEFICIARY' && (
                <div className="row-actions">
                  <button className="btn ghost sm" onClick={() => setDialog({ kind: 'withdraw', r })}>
                    <XCircle className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Withdraw request', 'Kuraho icyifuzo')}
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          title={t.x('No support requests yet', 'Nta byifuzo')}
          sub={t.x('Use "Request support" above to tell your officer what you need.',
            'Koresha "Saba ubufasha" haruguru umenyeshe umukozi icyo ukeneye.')}
        />
      )}

      {dialog?.kind === 'ask' && (
        <AskDialog suggested={profile.data?.supportNeeds} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'withdraw' && <WithdrawDialog r={dialog.r} onClose={close} onDone={done} />}
    </>
  );
}

function AskDialog({ suggested, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const [need, setNeed] = useState('');
  const m = useMutation();

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={t.x('Request support', 'Saba ubufasha')}
      subtitle={t.x('Describe what you need in your own words. Your local officer reviews every request and must record a reason for their decision, which you will be shown here and sent by email.',
        "Sobanura icyo ukeneye mu magambo yawe. Umukozi w'akarere arasuzuma buri cyifuzo kandi agomba kwandika impamvu y'icyemezo, ukayibona hano no kuri imeyili.")}
      submitLabel={t.x('Send request', 'Ohereza')}
      onSubmit={() => {
        if (!need.trim()) return m.setError(t.x('Please describe the support you need.', 'Nyamuneka sobanura ubufasha ukeneye.'));
        return m.run(() => post('/support/requests', { need: need.trim() }), {
          success: t.x('Your request was sent to your officer', 'Icyifuzo cyawe cyoherejwe ku mukozi'),
          then: onDone,
        });
      }}
    >
      {suggested && (
        <div className="modal-current">
          <div className="rl">{t.x('Recorded in your profile', 'Ibiri mu mwirondoro wawe')}</div>
          {suggested}
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn ghost sm" onClick={() => setNeed(suggested)}>
              {t.x('Use this', 'Koresha ibi')}
            </button>
          </div>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <label className="field-label" htmlFor="ask-need">{t.x('What support do you need?', 'Ni ubuhe bufasha ukeneye?')} *</label>
        <textarea ref={first} id="ask-need" className="app-input" style={{ minHeight: 100 }}
          value={need} onChange={(e) => setNeed(e.target.value)}
          placeholder={t.x('For example: a wheelchair, hearing aid, vocational training…',
            "Urugero: akagare k'abamugaye, igikoresho cyo kumva, amahugurwa…")} />
        <small className="hint">
          {t.x('If you cannot use this form, your guardian or your local officer can raise a request on your behalf.',
            "Niba udashobora gukoresha iyi fomu, umurezi cyangwa umukozi w'akarere abikora mu izina ryawe.")}
        </small>
      </div>
    </FormModal>
  );
}

function WithdrawDialog({ r, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone="red"
      title={t.x(`Withdraw request ${r.code}?`, `Kuraho icyifuzo ${r.code}?`)}
      message={t.x('The request is closed and your officer is told it was withdrawn. Its history is kept, and you can always make a new request.',
        'Icyifuzo gihagarikwa kandi umukozi aramenyeshwa. Amateka aguma aho, kandi ushobora kongera gusaba.')}
      confirmLabel={t.x('Withdraw', 'Kuraho')}
      onConfirm={() => m.run(() => post(`/support/requests/${r.id}/cancel`), {
        success: t.x('Request withdrawn', 'Cyahagaritswe'), then: onDone,
      })}
    />
  );
}
