import { useState, useRef } from 'react';
import { Send, XCircle, CalendarClock, Users2 } from 'lucide-react';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { OPP_ICON } from '../../lib/constants.js';
import { Badge, Empty, Loading, ErrorState } from '../../components/ui.jsx';
import { FormModal, ConfirmModal } from '../../components/Modal.jsx';
import { timeAgo, daysUntil } from '../../lib/format.js';

const KINDS = ['scholarship', 'job', 'training', 'announcement'];

const APP_TONE = {
  SUBMITTED: 'amber', SHORTLISTED: 'sky', ACCEPTED: 'green',
  DECLINED: 'gray', WITHDRAWN: 'gray',
};

// ─────────────────────────────────────────────────────────────
// Opportunities — and the ability to act on them.
//
// Publishing to every registered beneficiary fixed the distribution failure:
// the information now travels. But a person who reads "Bursary for students
// with disabilities, apply by 30 August" and has no way to say *me* is no
// better served than before — the information reached them, the opportunity
// did not. Publishing without a way to respond just moves the exclusion one
// step later.
//
// So every posting carries an Apply action, the applicant's own status, the
// recorded reason for whatever was decided, and the right to withdraw while
// it is still undecided. Where the person cannot use this form at all, their
// officer can apply for them — and the card says so, because being helped
// must never mean being kept in the dark about what was done in your name.
//
// The list is filterable because it is cumulative and never pruned: someone
// looking for work should not have to read two years of scholarship notices,
// and a reader with a cognitive impairment least of all.
// ─────────────────────────────────────────────────────────────
export default function OpportunitiesPage() {
  const { t, a } = useUI();
  const list = useFetch('/opportunities');
  const mine = useFetch('/my/applications');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [dialog, setDialog] = useState(null);   // { kind: 'apply' | 'withdraw', o, app? }

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;

  const label = {
    scholarship: t.x('Scholarship', 'Buruse'),
    job: t.x('Job', 'Akazi'),
    training: t.x('Training', 'Amahugurwa'),
    announcement: t.x('Announcement', 'Itangazo'),
  };
  const statusLabel = {
    SUBMITTED: t.x('Applied — awaiting a decision', 'Wasabye — bitegereje icyemezo'),
    SHORTLISTED: t.x('Shortlisted', 'Waratoranyijwe'),
    ACCEPTED: t.x('Accepted', 'Wemerewe'),
    DECLINED: t.x('Not selected', 'Ntiwatoranyijwe'),
    WITHDRAWN: t.x('Withdrawn', 'Wabikuyeho'),
  };

  // Index the beneficiary's own applications by opportunity, so each card can
  // say where *they* stand rather than only what the opportunity is.
  const byOpportunity = Object.fromEntries((mine.data || []).map((x) => [x.opportunityId, x]));

  const all = list.data || [];
  const term = q.trim().toLowerCase();
  const rows = all.filter((o) =>
    (kind === 'all' || (kind === 'mine' ? !!byOpportunity[o.id] : o.kind === kind))
    && (!term || [o.title, o.org, o.detail].filter(Boolean).join(' ').toLowerCase().includes(term)));

  const close = () => setDialog(null);
  const done = () => { close(); list.reload(); mine.reload(); };

  if (!all.length) {
    return (
      <Empty
        title={t.x('No opportunities yet', 'Nta mahirwe arahari')}
        sub={t.x('Scholarships, jobs, training and announcements published for you appear here — and you can apply to them from this page.',
          "Buruse, akazi, amahugurwa n'amatangazo bizagaragara hano — kandi ushobora kubisaba uhereye hano.")}
      />
    );
  }

  const appliedCount = (mine.data || []).filter((x) => x.status !== 'WITHDRAWN').length;

  return (
    <>
      <div className="toolbar">
        <div className="grow">
          <label htmlFor="opp-q" className="sr-only">{t.x('Search opportunities', 'Shakisha amahirwe')}</label>
          <input
            id="opp-q" className="input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t.x('Search by title, organisation or detail…', 'Shakisha umutwe, umuryango…')}
          />
        </div>
        <select
          className="app-select" style={{ maxWidth: 250 }} value={kind}
          onChange={(e) => setKind(e.target.value)} aria-label={t.x('Filter by type', 'Shungura ubwoko')}
        >
          <option value="all">{t.x(`All types (${all.length})`, `Ubwoko bwose (${all.length})`)}</option>
          <option value="mine">{t.x(`I applied (${appliedCount})`, `Nasabye (${appliedCount})`)}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>{label[k]} ({all.filter((o) => o.kind === k).length})</option>
          ))}
        </select>
      </div>

      {rows.length ? (
        <>
          <p className="page-sub" style={{ marginTop: 14 }} role="status">
            {t.x(`${rows.length} opportunity/ies`, `Amahirwe ${rows.length}`)}
          </p>
          <div className="grid g2">
            {rows.map((o) => {
              const app = byOpportunity[o.id];
              const live = app && app.status !== 'WITHDRAWN';
              const closing = daysUntil(o.deadline);

              return (
                <div key={o.id} className={`card opp ${o.kind}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <span className="badge b-sky">
                      <span aria-hidden="true">{OPP_ICON[o.kind]}</span> {label[o.kind] || o.kind}
                    </span>
                    <small className="hint">{timeAgo(o.createdAt, a.lang)}</small>
                  </div>

                  <div className="card-t" style={{ marginTop: 8 }}>{o.title}</div>

                  <div className="meta">
                    <span><b>{t.x('Published by', 'Batanze')}:</b> {o.org || o.author?.fullName || '—'}</span>
                    {o.slots ? (
                      <span>
                        <Users2 className="h-[13px] w-[13px]" aria-hidden="true" style={{ verticalAlign: -2 }} />{' '}
                        {t.x(`${o.slots} place(s)`, `Imyanya ${o.slots}`)}
                      </span>
                    ) : null}
                    {o.deadline && (
                      <span>
                        <CalendarClock className="h-[13px] w-[13px]" aria-hidden="true" style={{ verticalAlign: -2 }} />{' '}
                        {t.x('Closes', 'Bifunga')} {o.deadline}
                      </span>
                    )}
                  </div>

                  {o.detail && (
                    <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: 'var(--muted)' }}>{o.detail}</div>
                  )}

                  {/* Where this person stands — the whole point of the page. */}
                  {live && (
                    <div className="rec">
                      <div className="rl">{t.x('Your application', 'Icyifuzo cyawe')}</div>
                      <Badge tone={APP_TONE[app.status]}>{statusLabel[app.status]}</Badge>
                      {app.origin === 'OFFICER' && (
                        <>
                          <div className="rl" style={{ marginTop: 10 }}>{t.x('Submitted by', 'Cyoherejwe na')}</div>
                          <span className="rr">{t.x('Your local officer, on your behalf', "Umukozi w'akarere, mu izina ryawe")}</span>
                        </>
                      )}
                      {app.decisionReason && (
                        <>
                          <div className="rl" style={{ marginTop: 10 }}>{t.x('Reason recorded', 'Impamvu yanditse')}</div>
                          <span className="rr">{app.decisionReason}</span>
                        </>
                      )}
                    </div>
                  )}

                  <div className="row-actions">
                    {!o.open ? (
                      <Badge tone="gray">
                        {o.kind === 'announcement'
                          ? t.x('Information only', 'Amakuru gusa')
                          : t.x('Applications closed', 'Gusaba byarafunzwe')}
                      </Badge>
                    ) : live ? (
                      ['SUBMITTED', 'SHORTLISTED'].includes(app.status) ? (
                        <button className="btn ghost sm" onClick={() => setDialog({ kind: 'withdraw', app, o })}>
                          <XCircle className="h-[14px] w-[14px]" aria-hidden="true" />
                          {t.x('Withdraw my application', 'Kuraho icyifuzo cyanjye')}
                        </button>
                      ) : (
                        <Badge tone={APP_TONE[app.status]}>{statusLabel[app.status]}</Badge>
                      )
                    ) : (
                      <>
                        <button className="btn sm" onClick={() => setDialog({ kind: 'apply', o })}>
                          <Send className="h-[14px] w-[14px]" aria-hidden="true" />
                          {app ? t.x('Apply again', 'Ongera usabe') : t.x('Apply', 'Saba')}
                        </button>
                        {closing != null && closing <= 7 && (
                          <Badge tone="amber">
                            {closing <= 0
                              ? t.x('Closes today', 'Bifunga uyu munsi')
                              : t.x(`${closing} day(s) left`, `Hasigaye iminsi ${closing}`)}
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <Empty
          title={kind === 'mine'
            ? t.x('You have not applied to anything yet', 'Nta cyo warasaba')
            : t.x('Nothing matches this filter', 'Nta kiri muri aya mashakiro')}
          sub={kind === 'mine'
            ? t.x('Open an opportunity above and use "Apply". If you cannot use this form, your local officer can apply for you.',
              "Fungura amahirwe haruguru ukoreshe \"Saba\". Nutabishobora, umukozi w'akarere abikora mu izina ryawe.")
            : t.x('Try a different word, or set the type back to all.', 'Gerageza irindi jambo cyangwa usubize ubwoko kuri byose.')}
        />
      )}

      {dialog?.kind === 'apply' && <ApplyDialog o={dialog.o} onClose={close} onDone={done} />}
      {dialog?.kind === 'withdraw' && <WithdrawDialog app={dialog.app} o={dialog.o} onClose={close} onDone={done} />}
    </>
  );
}

// ── Apply ────────────────────────────────────────────────────
function ApplyDialog({ o, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const [note, setNote] = useState('');
  const m = useMutation();

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={t.x(`Apply: ${o.title}`, `Gusaba: ${o.title}`)}
      subtitle={t.x('Your application goes to whoever published this opportunity. You will be told the outcome and the reason for it, here and by email — a decision that must be explained is a decision that must be justifiable.',
        "Icyifuzo cyawe kigera ku watangaje aya mahirwe. Uzamenyeshwa icyemezo n'impamvu yacyo, hano no kuri imeyili.")}
      submitLabel={t.x('Send my application', 'Ohereza icyifuzo')}
      onSubmit={() => m.run(() => post(`/opportunities/${o.id}/apply`, { note: note.trim() }), {
        success: t.x('Your application was sent', 'Icyifuzo cyawe cyoherejwe'),
        then: onDone,
      })}
    >
      <div className="modal-current">
        <div className="rl">{t.x('Opportunity', 'Amahirwe')}</div>
        {o.title}
        {o.org && (
          <>
            <div className="rl" style={{ marginTop: 10 }}>{t.x('Published by', 'Batanze')}</div>
            {o.org}
          </>
        )}
        {o.deadline && (
          <>
            <div className="rl" style={{ marginTop: 10 }}>{t.x('Closing date', 'Itariki ntarengwa')}</div>
            {o.deadline}
          </>
        )}
        {o.slots ? (
          <>
            <div className="rl" style={{ marginTop: 10 }}>{t.x('Places available', 'Imyanya ihari')}</div>
            {o.slots}
          </>
        ) : null}
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="field-label" htmlFor="ap-note">
          {t.x('Why this would help you (optional)', 'Impamvu byagufasha (si itegeko)')}
        </label>
        <textarea
          ref={first} id="ap-note" className="app-input" style={{ minHeight: 100 }}
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={t.x('For example: I want to continue vocational school but cannot pay the fees.',
            "Urugero: Ndashaka gukomeza amashuri y'imyuga ariko sinshobora kwishyura.")}
        />
        <small className="hint">
          {t.x('You may leave this empty — your recorded needs are already on your file. If you cannot use this form at all, your guardian or your local officer can apply for you.',
            "Ushobora kubisiga ubusa — ubukene bwawe bwamaze kwandikwa. Nutabasha gukoresha iyi fomu, umurezi cyangwa umukozi w'akarere abikora mu izina ryawe.")}
        </small>
      </div>
    </FormModal>
  );
}

// ── Withdraw ─────────────────────────────────────────────────
function WithdrawDialog({ app, o, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone="red"
      title={t.x(`Withdraw your application to "${o.title}"?`, `Kuraho icyifuzo cyawe muri "${o.title}"?`)}
      message={t.x('Your application is closed as withdrawn and is no longer considered. The record of it is kept, and you can apply again while the opportunity is still open.',
        'Icyifuzo cyawe gihagarikwa ntikizongera gusuzumwa. Amateka aguma aho, kandi ushobora kongera gusaba mu gihe bikiri bifunguye.')}
      confirmLabel={t.x('Withdraw', 'Kuraho')}
      onConfirm={() => m.run(() => post(`/applications/${app.id}/withdraw`), {
        success: t.x('Application withdrawn', 'Icyifuzo cyakuweho'), then: onDone,
      })}
    />
  );
}
