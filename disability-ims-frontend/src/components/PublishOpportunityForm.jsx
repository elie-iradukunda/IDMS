import { useState } from 'react';
import { post, patch, api } from '../lib/api.js';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFetch } from '../lib/useFetch.js';
import { OPP_ICON } from '../lib/constants.js';
import { timeAgo } from '../lib/format.js';
import { Card, Empty } from './ui.jsx';

const KINDS = ['scholarship', 'job', 'training', 'announcement'];

// Publish + manage opportunities. Publishing notifies every registered
// beneficiary. The author (or an administrator) can edit or delete an
// opportunity they published.
export default function PublishOpportunityForm({ org = '', heading, blurb }) {
  const { t, say } = useUI();
  const { user } = useAuth();
  const list = useFetch('/opportunities');
  const [f, setF] = useState({ kind: 'scholarship', title: '', org, detail: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // opportunity being edited

  const kindLabel = {
    scholarship: t.x('Scholarship', 'Buruse'), job: t.x('Job', 'Akazi'),
    training: t.x('Training', 'Amahugurwa'), announcement: t.x('Announcement', 'Itangazo'),
  };
  const canManage = (o) => o.postedById === user?.id || user?.role === 'ADMIN';

  async function publish() {
    if (!f.title.trim()) return setErr(t.x('A title is required.', 'Umutwe urakenewe.'));
    setBusy(true); setErr('');
    try {
      await post('/opportunities', f);
      setF({ ...f, title: '', detail: '' });
      say(t.x('Published — every registered beneficiary was notified', 'Byatangajwe — abunganirwa bose bamenyeshejwe'));
      list.reload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!editing.title.trim()) return;
    try {
      await patch(`/opportunities/${editing.id}`, { kind: editing.kind, title: editing.title, org: editing.org, detail: editing.detail });
      setEditing(null);
      say(t.x('Opportunity updated', 'Byahinduwe'));
      list.reload();
    } catch (e) { say(e.message); }
  }

  async function remove(o) {
    if (!window.confirm(t.x(`Delete "${o.title}"?`, `Gusiba "${o.title}"?`))) return;
    try {
      await api(`/opportunities/${o.id}`, { method: 'DELETE' });
      say(t.x('Opportunity deleted', 'Byasibwe'));
      list.reload();
    } catch (e) { say(e.message); }
  }

  return (
    <>
      <div className="card" style={{ marginTop: 22, maxWidth: 660 }}>
        <div className="card-t">{heading || t.x('Publish an opportunity or announcement', 'Tangaza amahirwe')}</div>
        <small className="hint">
          {blurb || t.x('Opportunities intended for persons with disabilities routinely fail to reach them. Publishing here notifies every registered beneficiary directly.',
            'Amahirwe menshi ntagera ku bafite ubumuga. Aha bagezwaho bose.')}
        </small>
        <div className="form-grid">
          <div>
            <label className="field-label">{t.x('Type', 'Ubwoko')}</label>
            <select className="app-select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k} value={k}>{kindLabel[k]}</option>)}
            </select>
          </div>
          <div><label className="field-label">{t.x('Organisation', 'Umuryango')}</label><input className="app-input" value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })} /></div>
          <div className="full"><label className="field-label">{t.x('Title', 'Umutwe')} *</label><input className="app-input" value={f.title} onChange={(e) => { setF({ ...f, title: e.target.value }); setErr(''); }} /></div>
          <div className="full"><label className="field-label">{t.x('Details', 'Ibisobanuro')}</label><textarea className="app-input" style={{ minHeight: 80 }} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></div>
        </div>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="app-button" style={{ marginTop: 14 }} onClick={publish} disabled={busy}>
          {busy ? t.x('Publishing…', 'Biratangazwa…') : t.x('Publish & notify beneficiaries', 'Tangaza')}
        </button>
      </div>

      <Card style={{ marginTop: 16 }}>
        <div className="card-t">{t.x('Published opportunities', 'Amahirwe yatangajwe')}</div>
        {list.data?.length ? (
          <div style={{ marginTop: 6 }}>
            {list.data.map((o) => (
              <div key={o.id} style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                {editing?.id === o.id ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                      <select className="app-select" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                        {KINDS.map((k) => <option key={k} value={k}>{kindLabel[k]}</option>)}
                      </select>
                      <input className="app-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                    </div>
                    <input className="app-input" value={editing.org || ''} onChange={(e) => setEditing({ ...editing, org: e.target.value })} placeholder={t.x('Organisation', 'Umuryango')} />
                    <textarea className="app-input" value={editing.detail || ''} onChange={(e) => setEditing({ ...editing, detail: e.target.value })} />
                    <div className="row-actions" style={{ marginTop: 0 }}>
                      <button className="btn green sm" onClick={saveEdit}>{t('save')}</button>
                      <button className="btn ghost sm" onClick={() => setEditing(null)}>{t('cancel')}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{OPP_ICON[o.kind]} {o.title}</div>
                      <small className="hint">{kindLabel[o.kind]} · {o.org || '—'} · {timeAgo(o.createdAt, t.lang)}</small>
                    </div>
                    {canManage(o) && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button className="btn ghost sm" onClick={() => setEditing({ id: o.id, kind: o.kind, title: o.title, org: o.org, detail: o.detail })}>{t.x('Edit', 'Hindura')}</button>
                        <button className="btn red sm" onClick={() => remove(o)}>{t.x('Delete', 'Siba')}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title={t.x('No opportunities yet', 'Nta mahirwe')} />
        )}
      </Card>
    </>
  );
}
