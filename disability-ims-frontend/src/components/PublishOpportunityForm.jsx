import { useState, useRef } from 'react';
import { Megaphone, Pencil, Trash2 } from 'lucide-react';
import { post, patch, del } from '../lib/api.js';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFetch } from '../lib/useFetch.js';
import { useMutation } from '../lib/useMutation.js';
import { OPP_ICON } from '../lib/constants.js';
import { timeAgo } from '../lib/format.js';
import { Card, Badge, Empty, Loading } from './ui.jsx';
import { FormModal, ConfirmModal } from './Modal.jsx';

const KINDS = ['scholarship', 'job', 'training', 'announcement'];

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
              <div key={o.id} style={{ padding: '14px 0', borderTop: '1px solid var(--border)' }}>
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
                    </div>
                    {o.detail && (
                      <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: 'var(--muted)' }}>
                        {o.detail}
                      </div>
                    )}
                  </div>
                  {canManage(o) && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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
  });
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
        : t.x('Every active registered beneficiary is notified in the app, and emailed where an address is on file.',
          'Abunganirwa bose bamenyeshwa muri sisitemu no kuri imeyili aho ihari.')}
      submitLabel={editing ? t.x('Save changes', 'Bika') : t.x('Publish & notify', 'Tangaza')}
      onSubmit={() => {
        if (!f.title.trim()) return m.setError(t.x('A title is required.', 'Umutwe urakenewe.'));
        return m.run(
          () => (editing ? patch(`/opportunities/${o.id}`, f) : post('/opportunities', f)),
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
