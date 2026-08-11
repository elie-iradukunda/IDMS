import { useState, useRef } from 'react';
import { Megaphone, Pencil, Trash2, Users2, CalendarClock } from 'lucide-react';
import { post, patch, del } from '../lib/api.js';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFetch } from '../lib/useFetch.js';
import { useMutation } from '../lib/useMutation.js';
import { OPP_ICON } from '../lib/constants.js';
import { timeAgo } from '../lib/format.js';
import { Card, Badge, Empty, Loading } from './ui.jsx';
import { FormModal, ConfirmModal } from './Modal.jsx';
import ApplicantsDialog from './ApplicantsDialog.jsx';

const KINDS = ['scholarship', 'job', 'training', 'announcement'];
const today = () => new Date().toISOString().slice(0, 10);

// Publish + manage opportunities. Jobs, scholarships and training intended
// for persons with disabilities routinely fail to reach them — not because
// they do not exist but because the information does not travel. Publishing
// here notifies every active beneficiary in-app and emails those with an
// address on file. The author (or an administrator) can edit or delete.
export default function PublishOpportunityForm({ org = '', heading, blurb }) {
  const { t, a } = useUI();
  const { user } = useAuth();
  const list = useFetch('/opportunities');
  const [dialog, setDialog] = useState(null);

  const kindLabel = {
    scholarship: t.x('Scholarship', 'Buruse'), job: t.x('Job', 'Akazi'),
    training: t.x('Training', 'Amahugurwa'), announcement: t.x('Announcement', 'Itangazo'),
  };
  const canManage = (o) => o.postedById === user?.id || user?.role === 'ADMIN';

  const close = () => setDialog(null);
  const done = () => { close(); list.reload(); };

  return (
    <>
      <div className="toolbar">
        <button className="app-button" onClick={() => setDialog({ kind: 'create' })}>
          <Megaphone className="h-[16px] w-[16px]" aria-hidden="true" style={{ marginRight: 7 }} />
          {heading || t.x('Publish an opportunity', 'Tangaza amahirwe')}
        </button>
      </div>

      <Card style={{ marginTop: 16 }}>
        <div className="card-t">{t.x('Published opportunities', 'Amahirwe yatangajwe')}</div>
        <small className="hint">
          {blurb || t.x(
            'Opportunities intended for persons with disabilities routinely fail to reach them, not because they do not exist but because the information does not travel. Publishing here notifies every registered beneficiary directly, in the app and by email.',
            'Amahirwe menshi ntagera ku bafite ubumuga. Aha bagezwaho bose, muri sisitemu no kuri imeyili.')}
        </small>

        {list.loading ? <Loading /> : list.data?.length ? (
          <div style={{ marginTop: 6 }}>
            {list.data.map((o) => (
              <div key={o.id} className="opp-row" style={{ padding: '14px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      <span aria-hidden="true">{OPP_ICON[o.kind]}</span> {o.title}
                    </div>
                    <div className="meta">
                      <Badge tone="sky">{kindLabel[o.kind]}</Badge>
                      <span>{o.org || '—'}</span>
                      <span>{timeAgo(o.createdAt, a.lang)}</span>
                      {o.author && <span>{t.x('by', 'na')} {o.author.fullName}</span>}
                      {o.deadline && (
                        <span>
                          <CalendarClock className="h-[13px] w-[13px]" aria-hidden="true" style={{ verticalAlign: -2 }} />{' '}
                          {t.x('closes', 'bifunga')} {o.deadline}
                        </span>
                      )}
                      {o.slots ? <span>{t.x(`${o.slots} place(s)`, `imyanya ${o.slots}`)}</span> : null}
                    </div>
                    {/* Applications are the outcome that matters — publishing
                        is only the means. Surfacing the count here is what
                        stops a posting quietly collecting responses nobody
                        opens. */}
                    {o.acceptsApplications && (
                      <div className="meta">
                        <Badge tone={o.pendingApplications ? 'amber' : 'gray'}>
                          {t.x(
                            `${o.applications} application(s) · ${o.pendingApplications} awaiting a decision`,
                            `Ibyifuzo ${o.applications} · ${o.pendingApplications} bitegereje icyemezo`,
                          )}
                        </Badge>
                        {!o.open && (
                          <Badge tone="gray">{t.x('Closed', 'Byarafunzwe')}</Badge>
                        )}
                      </div>
                    )}
                    {o.detail && (
                      <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: 'var(--muted)' }}>
                        {o.detail}
                      </div>
                    )}
                  </div>
                  {canManage(o) && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {o.acceptsApplications && (
                        <button className="btn sm" onClick={() => setDialog({ kind: 'applicants', o })}>
                          <Users2 className="h-[14px] w-[14px]" aria-hidden="true" />
                          {t.x('Applicants', 'Abasabye')}
                          {o.pendingApplications > 0 ? ` (${o.pendingApplications})` : ''}
                        </button>
                      )}
                      <button className="btn ghost sm" onClick={() => setDialog({ kind: 'edit', o })}
                        aria-label={t.x(`Edit ${o.title}`, `Hindura ${o.title}`)}>
                        <Pencil className="h-[14px] w-[14px]" aria-hidden="true" />
                      </button>
                      <button className="btn red sm" onClick={() => setDialog({ kind: 'delete', o })}
                        aria-label={t.x(`Delete ${o.title}`, `Siba ${o.title}`)}>
                        <Trash2 className="h-[14px] w-[14px]" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : <Empty title={t.x('No opportunities yet', 'Nta mahirwe')} />}
      </Card>

      {dialog?.kind === 'create' && <OppDialog defaultOrg={org} onClose={close} onDone={done} />}
      {dialog?.kind === 'edit' && <OppDialog o={dialog.o} onClose={close} onDone={done} />}
      {dialog?.kind === 'delete' && <DeleteDialog o={dialog.o} onClose={close} onDone={done} />}
      {dialog?.kind === 'applicants' && (
        <ApplicantsDialog o={dialog.o} onClose={close} onDone={() => list.reload()} />
      )}
    </>
  );
}

function OppDialog({ o, defaultOrg = '', onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const editing = !!o;
  const [f, setF] = useState({
    kind: o?.kind || 'scholarship', title: o?.title || '',
    org: o?.org ?? defaultOrg, detail: o?.detail || '',
    deadline: o?.deadline || '', slots: o?.slots ?? '',
  });
  // An announcement is information to read; the other three are things a
  // person must be able to act on, so only those take applications.
  const isAnnouncement = f.kind === 'announcement';
  const m = useMutation();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const kindLabel = {
    scholarship: t.x('Scholarship', 'Buruse'), job: t.x('Job', 'Akazi'),
    training: t.x('Training', 'Amahugurwa'), announcement: t.x('Announcement', 'Itangazo'),
  };

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={editing ? t.x('Edit opportunity', 'Hindura amahirwe') : t.x('Publish an opportunity', 'Tangaza amahirwe')}
      subtitle={editing
        ? t.x('Editing does not resend the notification — beneficiaries keep the message they already received.',
          'Guhindura ntibisubiramo kohereza ubutumwa.')
        : isAnnouncement
          ? t.x('An announcement is information to read. Every active registered beneficiary is notified in the app, and emailed where an address is on file.',
            'Itangazo ni amakuru yo gusoma. Abunganirwa bose bamenyeshwa.')
          : t.x('Every active registered beneficiary is notified in the app and by email, and can apply to it directly — publishing without a way to respond only moves the exclusion one step later.',
            "Abunganirwa bose bamenyeshwa kandi bashobora kubisaba — gutangaza nta buryo bwo gusubiza ni ukwimura ikibazo gusa.")}
      submitLabel={editing ? t.x('Save changes', 'Bika') : t.x('Publish & notify', 'Tangaza')}
      onSubmit={() => {
        if (!f.title.trim()) return m.setError(t.x('A title is required.', 'Umutwe urakenewe.'));
        const body = {
          ...f,
          deadline: isAnnouncement ? null : (f.deadline || null),
          slots: isAnnouncement || f.slots === '' ? null : Number(f.slots),
        };
        return m.run(
          () => (editing ? patch(`/opportunities/${o.id}`, body) : post('/opportunities', body)),
          {
            success: editing
              ? t.x('Opportunity updated', 'Byahinduwe')
              : t.x('Published — every registered beneficiary was notified', 'Byatangajwe — bose bamenyeshejwe'),
            then: onDone,
          },
        );
      }}
    >
      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="o-kind">{t.x('Type', 'Ubwoko')}</label>
          <select id="o-kind" className="app-select" value={f.kind} onChange={set('kind')}>
            {KINDS.map((k) => <option key={k} value={k}>{kindLabel[k]}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="o-org">{t.x('Organisation', 'Umuryango')}</label>
          <input id="o-org" className="app-input" value={f.org} onChange={set('org')} />
        </div>
        <div className="full">
          <label className="field-label" htmlFor="o-title">{t.x('Title', 'Umutwe')} *</label>
          <input ref={first} id="o-title" className="app-input" value={f.title} onChange={set('title')} />
        </div>

        {!isAnnouncement && (
          <>
            <div>
              <label className="field-label" htmlFor="o-deadline">{t.x('Closing date', 'Itariki ntarengwa')}</label>
              <input id="o-deadline" type="date" className="app-input" min={today()}
                value={f.deadline} onChange={set('deadline')} />
              <small className="hint">
                {t.x('An opportunity with no closing date never resolves — nobody can tell whether it is still open, and the people least able to chase it assume it has passed.',
                  'Amahirwe adafite itariki ntarengwa ntasozwa — nta wamenya niba akiri afunguye.')}
              </small>
            </div>
            <div>
              <label className="field-label" htmlFor="o-slots">{t.x('Places available', 'Imyanya ihari')}</label>
              <input id="o-slots" type="number" min="1" className="app-input" value={f.slots} onChange={set('slots')}
                placeholder={t.x('Leave empty if not fixed', 'Siga ubusa niba itazwi')} />
              <small className="hint">
                {t.x('Stating it is what makes a rejection legible: "20 places, 60 applicants" rather than "they chose others".',
                  'Kuvuga umubare bituma kunyagwa bisobanuka.')}
              </small>
            </div>
          </>
        )}
        <div className="full">
          <label className="field-label" htmlFor="o-detail">{t.x('Details', 'Ibisobanuro')}</label>
          <textarea id="o-detail" className="app-input" style={{ minHeight: 96 }} value={f.detail} onChange={set('detail')} />
          <small className="hint">
            {t.x('Say who it is for, what it covers and how to take it up. Plain language, because the message has to work for a reader with a cognitive impairment too.',
              "Vuga uwo bigenewe, icyo bikubiyemo n'uko byakwakirwa. Koresha amagambo yoroshye.")}
          </small>
        </div>
      </div>
    </FormModal>
  );
}

function DeleteDialog({ o, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone="red"
      title={t.x(`Delete "${o.title}"?`, `Gusiba "${o.title}"?`)}
      message={t.x('It is removed from the opportunities list for every beneficiary. Notifications already sent are not recalled.',
        'Bikurwa ku rutonde rw\'amahirwe. Ubutumwa bwamaze koherezwa ntibugarurwa.')}
      confirmLabel={t.x('Delete', 'Siba')}
      onConfirm={() => m.run(() => del(`/opportunities/${o.id}`), {
        success: t.x('Opportunity deleted', 'Byasibwe'), then: onDone,
      })}
    />
  );
}
