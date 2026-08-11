import { useState, useRef } from 'react';
import { Check, X, ListChecks, UserPlus } from 'lucide-react';
import { post, qs } from '../lib/api.js';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFetch } from '../lib/useFetch.js';
import { useMutation } from '../lib/useMutation.js';
import { useDebounced } from '../lib/useDebounced.js';
import { Badge, Empty, Loading } from './ui.jsx';
import Modal, { FormModal } from './Modal.jsx';
import { timeAgo } from '../lib/format.js';

const TONE = {
  SUBMITTED: 'amber', SHORTLISTED: 'sky', ACCEPTED: 'green',
  DECLINED: 'gray', WITHDRAWN: 'gray',
};

// ─────────────────────────────────────────────────────────────
// Who applied, and what was decided.
//
// The counterpart to the beneficiary's Apply button: an application nobody
// can see is an application that was never really received. Every decision
// takes a reason, exactly as a support-request decision does, because the
// applicant is shown it — and a rejection a person cannot have explained to
// them is indistinguishable from an arbitrary one.
//
// The officer can also apply on behalf of a beneficiary from here. That is
// not a convenience: a self-service-only system quietly selects for literacy,
// for owning a device and for having an email address, which is exactly the
// population a rural disability registry cannot assume.
// ─────────────────────────────────────────────────────────────
export default function ApplicantsDialog({ o, onClose, onDone }) {
  const { t, a } = useUI();
  const { user } = useAuth();
  const { data, loading, reload } = useFetch(`/opportunities/${o.id}/applications`);
  const [decide, setDecide] = useState(null);   // { app, status }
  const [addFor, setAddFor] = useState(false);

  const rows = data || [];
  const undecided = rows.filter((r) => ['SUBMITTED', 'SHORTLISTED'].includes(r.status));

  const statusLabel = {
    SUBMITTED: t.x('Awaiting a decision', 'Bitegereje icyemezo'),
    SHORTLISTED: t.x('Shortlisted', 'Yatoranyijwe'),
    ACCEPTED: t.x('Accepted', 'Yemerewe'),
    DECLINED: t.x('Not selected', 'Ntiyatoranyijwe'),
    WITHDRAWN: t.x('Withdrawn by the applicant', 'Yabikuyeho'),
  };

  const refresh = () => { reload(); onDone?.(); };

  return (
    <>
      <Modal
        open onClose={onClose} size="lg"
        title={t.x(`Applicants — ${o.title}`, `Abasabye — ${o.title}`)}
        subtitle={t.x(
          'Every decision carries a reason, and the applicant is shown it in the app and by email. Where a beneficiary cannot use the form, apply on their behalf — a self-service-only process silently excludes the people least able to reach it.',
          "Buri cyemezo gifite impamvu, kandi usaba arayibona. Iyo uwunguka adashobora gukoresha fomu, umusabire — bitaba ibyo abatabishobora bagumaho.")}
        footer={(
          <>
            {user?.role === 'OFFICER' && (
              <div className="spacer">
                <button type="button" className="btn ghost sm" onClick={() => setAddFor(true)} disabled={!o.open}>
                  <UserPlus className="h-[14px] w-[14px]" aria-hidden="true" />
                  {t.x('Apply on behalf of a beneficiary', 'Gusabira uwunguka')}
                </button>
              </div>
            )}
            <button type="button" className="btn ghost sm" onClick={onClose}>{t('cancel')}</button>
          </>
        )}
      >
        <div className="modal-current">
          <div className="rl">{t.x('Applications', 'Ibyifuzo')}</div>
          {t.x(
            `${rows.length} received · ${undecided.length} awaiting a decision${o.slots ? ` · ${o.slots} place(s)` : ''}`,
            `${rows.length} byakiriwe · ${undecided.length} bitegereje icyemezo${o.slots ? ` · imyanya ${o.slots}` : ''}`)}
          {!o.open && (
            <>
              <div className="rl" style={{ marginTop: 10 }}>{t.x('Status', 'Imimerere')}</div>
              {o.closedReason || t.x('Closed', 'Byarafunzwe')}
            </>
          )}
        </div>

        {loading ? <Loading /> : rows.length ? (
          <div style={{ marginTop: 6 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ padding: '14px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>
                      {r.beneficiary?.fullName} <span className="code">{r.beneficiary?.code}</span>
                    </div>
                    <div className="meta">
                      <span>{[r.beneficiary?.sector, r.beneficiary?.village].filter(Boolean).join(' · ')}</span>
                      <span>{t.x('Applied', 'Yasabye')} {timeAgo(r.createdAt, a.lang)}</span>
                      {r.origin === 'OFFICER' && (
                        <span><b>{t.x('Submitted by an officer on their behalf', "Umukozi yamusabiye")}</b></span>
                      )}
                    </div>
                  </div>
                  <Badge tone={TONE[r.status]}>{statusLabel[r.status]}</Badge>
                </div>

                {r.beneficiary?.supportNeeds && (
                  <div className="rec">
                    <div className="rl">{t.x('Recorded support need', 'Ubukene bwanditse')}</div>
                    <span className="rr">{r.beneficiary.supportNeeds}</span>
                    {r.note && (
                      <>
                        <div className="rl" style={{ marginTop: 10 }}>{t.x('What the applicant said', 'Icyo usaba yavuze')}</div>
                        <span className="rr">{r.note}</span>
                      </>
                    )}
                  </div>
                )}

                {r.decisionReason && (
                  <div className="rec">
                    <div className="rl">{t.x('Recorded decision reason', 'Impamvu yanditse')}</div>
                    <span className="rr">{r.decisionReason}</span>
                  </div>
                )}

                {['SUBMITTED', 'SHORTLISTED'].includes(r.status) && (
                  <div className="row-actions">
                    <button className="btn green sm" onClick={() => setDecide({ app: r, status: 'ACCEPTED' })}>
                      <Check className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Accept', 'Emera')}
                    </button>
                    {r.status === 'SUBMITTED' && (
                      <button className="btn sm" onClick={() => setDecide({ app: r, status: 'SHORTLISTED' })}>
                        <ListChecks className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Shortlist', 'Toranya')}
                      </button>
                    )}
                    <button className="btn red sm" onClick={() => setDecide({ app: r, status: 'DECLINED' })}>
                      <X className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Not selected', 'Ntiyatoranyijwe')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title={t.x('Nobody has applied yet', 'Nta wasabye')}
            sub={t.x('Beneficiaries were notified in the app and by email when this was published. An officer can also apply on behalf of someone who cannot use the form.',
              "Abunganirwa bamenyeshejwe. Umukozi ashobora no gusabira utabishoboye.")}
          />
        )}
      </Modal>

      {decide && (
        <DecideDialog
          app={decide.app} status={decide.status} title={o.title}
          onClose={() => setDecide(null)}
          onDone={() => { setDecide(null); refresh(); }}
        />
      )}
      {addFor && (
        <ApplyForDialog o={o} onClose={() => setAddFor(false)} onDone={() => { setAddFor(false); refresh(); }} />
      )}
    </>
  );
}

// ── Decide, with a reason the applicant will read ────────────
function DecideDialog({ app, status, title, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const [reason, setReason] = useState('');
  const m = useMutation();

  const meta = {
    ACCEPTED: {
      title: t.x(`Accept ${app.beneficiary?.fullName}`, `Kwemera ${app.beneficiary?.fullName}`),
      label: t.x('Accept applicant', 'Emera'),
      hint: t.x('They are told they were accepted, with this reason, in the app and by email.',
        'Aramenyeshwa ko yemerewe, hamwe niyi mpamvu.'),
      placeholder: t.x('For example: awarded one of the 15 places; covers fees and an assistive device.',
        'Urugero: yahawe umwanya muri 15; birimo amafaranga y\'ishuri n\'igikoresho.'),
    },
    SHORTLISTED: {
      title: t.x(`Shortlist ${app.beneficiary?.fullName}`, `Gutoranya ${app.beneficiary?.fullName}`),
      label: t.x('Move to the next stage', 'Mujyane ku ntambwe ikurikira'),
      hint: t.x('Tell them what happens next — a shortlist with no next step is indistinguishable from silence.',
        'Bamubwire ibikurikira — gutoranywa hatabaye igikurikira ni nko guceceka.'),
      placeholder: t.x('For example: meets the criteria; invited to the district interview on the 12th.',
        'Urugero: yujuje ibisabwa; atumiwe ku kiganiro ku itariki ya 12.'),
    },
    DECLINED: {
      title: t.x(`Record ${app.beneficiary?.fullName} as not selected`, `Kwandika ko ${app.beneficiary?.fullName} atatoranyijwe`),
      label: t.x('Record as not selected', 'Andika ko atatoranyijwe'),
      hint: t.x('The applicant reads this reason. Say what it was based on, and where it exists, what they could try instead.',
        "Usaba arasoma iyi mpamvu. Vuga icyo ishingiyeho, n'icyo yakora ubutaha."),
      placeholder: t.x('For example: the role needs on-screen data entry the workplace cannot yet adapt; a training place has been suggested instead.',
        'Urugero: akazi gasaba ibyo ahantu hatashoboye guhindura; yagiriwe inama yo kujya mu mahugurwa.'),
    },
  }[status];

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={meta.title}
      subtitle={t.x('A reason is required and is shown to the applicant. A decision that must be explained is a decision that must be justifiable.',
        'Impamvu irakenewe kandi usaba arayibona.')}
      submitLabel={meta.label}
      onSubmit={() => {
        if (!reason.trim()) {
          return m.setError(t.x('A reason is required and is shown to the applicant.', 'Impamvu irakenewe.'));
        }
        return m.run(() => post(`/applications/${app.id}/decide`, { status, reason: reason.trim() }), {
          success: t.x('Decision recorded and the applicant notified', 'Icyemezo cyanditswe, usaba aramenyeshwa'),
          then: onDone,
        });
      }}
    >
      <div className="modal-current">
        <div className="rl">{t.x('Opportunity', 'Amahirwe')}</div>
        {title}
        <div className="rl" style={{ marginTop: 10 }}>{t.x('Applicant', 'Usaba')}</div>
        {app.beneficiary?.fullName} ({app.beneficiary?.code}) · {app.beneficiary?.sector}
        {app.note && (
          <>
            <div className="rl" style={{ marginTop: 10 }}>{t.x('What they said', 'Icyo yavuze')}</div>
            {app.note}
          </>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="field-label" htmlFor="ad-reason">{t.x('Reason', 'Impamvu')} *</label>
        <textarea
          ref={first} id="ad-reason" className="app-input" style={{ minHeight: 96 }}
          value={reason} onChange={(e) => { setReason(e.target.value); m.reset(); }}
          placeholder={meta.placeholder}
        />
        <small className="hint">{meta.hint}</small>
      </div>
    </FormModal>
  );
}

// ── Officer applies on behalf of a beneficiary ───────────────
function ApplyForDialog({ o, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState('');
  const m = useMutation();
  const term = useDebounced(q, 350);

  // Only active records can be applied for, which is what the API enforces
  // too — so the list must not offer what the server will refuse.
  const { data, loading } = useFetch(
    term.trim().length >= 2 ? `/registry${qs({ q: term, status: 'ACTIVE', limit: 8 })}` : null,
  );

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={t.x('Apply on behalf of a beneficiary', 'Gusabira uwunguka')}
      subtitle={t.x(
        'For someone who has no email, no device, or cannot use the form. The application is recorded as officer-submitted, and the beneficiary is notified that it was made in their name — being helped must not mean being kept in the dark.',
        "Ku utagira imeyili cyangwa utabasha gukoresha fomu. Byandikwa ko umukozi ari we wabikoze, kandi uwunguka aramenyeshwa.")}
      submitLabel={t.x('Submit the application', 'Ohereza icyifuzo')}
      onSubmit={() => {
        if (!picked) return m.setError(t.x('Choose the beneficiary you are applying for.', 'Hitamo uwo usabira.'));
        return m.run(
          () => post(`/opportunities/${o.id}/apply`, { beneficiaryId: picked.id, note: note.trim() }),
          { success: t.x(`Applied on behalf of ${picked.code}`, `Wasabiye ${picked.code}`), then: onDone },
        );
      }}
    >
      <div>
        <label className="field-label" htmlFor="af-q">{t.x('Find the beneficiary', 'Shakisha uwunguka')} *</label>
        <input
          ref={first} id="af-q" className="app-input" value={q}
          onChange={(e) => { setQ(e.target.value); setPicked(null); m.reset(); }}
          placeholder={t.x('Name, code or village…', 'Izina, code, umudugudu…')}
        />
      </div>

      {picked ? (
        <div className="modal-current" style={{ marginTop: 12 }}>
          <div className="rl">{t.x('Applying for', 'Usabira')}</div>
          <b>{picked.fullName}</b> <span className="code">{picked.code}</span>
          <div className="rl" style={{ marginTop: 10 }}>{t.x('Recorded support need', 'Ubukene bwanditse')}</div>
          {picked.supportNeeds}
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn ghost sm" onClick={() => setPicked(null)}>
              {t.x('Choose someone else', 'Hitamo undi')}
            </button>
          </div>
        </div>
      ) : loading ? <Loading /> : data?.length ? (
        <div className="modal-current" style={{ marginTop: 12, padding: '4px 13px' }}>
          {data.map((b) => (
            <div key={b.id} className="imp-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {b.fullName} <span className="code">{b.code}</span>
                </div>
                <small className="hint">{[b.sector, b.village].filter(Boolean).join(' · ')}</small>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => setPicked(b)}>
                {t.x('Select', 'Hitamo')}
              </button>
            </div>
          ))}
        </div>
      ) : term.trim().length >= 2 ? (
        <small className="hint" style={{ display: 'block', marginTop: 12 }}>
          {t.x('No active record matches that search.', 'Nta nyandiko ikora ihuye n\'ibyo.')}
        </small>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <label className="field-label" htmlFor="af-note">{t.x('Note (optional)', 'Inyandiko (si itegeko)')}</label>
        <textarea
          id="af-note" className="app-input" style={{ minHeight: 80 }}
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={t.x('For example: applied at the sector office — no email or device at home.',
            "Urugero: yasabiye ku biro by'umurenge — nta imeyili cyangwa igikoresho afite.")}
        />
      </div>
    </FormModal>
  );
}
