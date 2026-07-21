import { useState } from 'react';
import { post, patch, api } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { ROLES } from '../../lib/constants.js';
import { Card, Badge, Loading, ErrorState } from '../../components/ui.jsx';

const STAFF_ROLES = ['OFFICER', 'PROVIDER', 'ADMIN'];
const BLANK = { fullName: '', email: '', password: '', role: 'OFFICER', sector: '', providerId: '' };

// Full user & role management (Objective 4 / RBAC): create staff accounts,
// change roles, deactivate/reactivate and delete — without touching
// beneficiary records.
export default function UsersPage() {
  const { t, say } = useUI();
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useFetch('/admin/users');
  const providers = useFetch('/admin/providers');
  const [f, setF] = useState(BLANK);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function act(fn, msg) {
    try { await fn(); if (msg) say(msg); reload(); }
    catch (e) { say(e.message); }
  }
  const changeRole = (u, role) => act(() => patch(`/admin/users/${u.id}`, { role }), t.x('Role updated', 'Uruhare rwahinduwe'));
  const toggleStatus = (u) => act(() => patch(`/admin/users/${u.id}`, { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
    u.status === 'ACTIVE' ? t.x('User deactivated', 'Yahagaritswe') : t.x('User reactivated', 'Yasubijwe'));
  const remove = (u) => {
    if (!window.confirm(t.x(`Delete ${u.email}? This cannot be undone.`, `Gusiba ${u.email}? Ntibisubirwaho.`))) return;
    act(() => api(`/admin/users/${u.id}`, { method: 'DELETE' }), t.x('User deleted', 'Yasibwe'));
  };

  async function create() {
    if (!f.fullName.trim() || !f.email.trim()) return setErr(t.x('Name and email are required.', "Izina n'imeyili birakenewe."));
    if (f.password.length < 8) return setErr(t.x('Password must be at least 8 characters.', 'Ijambobanga rigomba kuba nibura inyuguti 8.'));
    if (f.role === 'PROVIDER' && !f.providerId) return setErr(t.x('Select a provider organisation.', 'Hitamo umuryango.'));
    setBusy(true); setErr('');
    try {
      await post('/admin/users', {
        fullName: f.fullName, email: f.email, password: f.password, role: f.role,
        sector: f.role === 'OFFICER' ? f.sector : undefined,
        providerId: f.role === 'PROVIDER' ? Number(f.providerId) : undefined,
      });
      setF(BLANK);
      say(t.x('Staff account created', 'Konti yakozwe'));
      reload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const scopeOf = (u) => u.sector || (u.beneficiaryId ? `#${u.beneficiaryId}` : u.providerId ? `Provider #${u.providerId}` : '—');

  return (
    <>
      <Card style={{ marginTop: 22 }}>
        <div className="card-t">{t.x('Users & role permissions', 'Abakoresha & uburenganzira')}</div>
        <table>
          <thead>
            <tr>
              <th>{t.x('Name', 'Izina')}</th><th>{t.x('Email', 'Imeyili')}</th>
              <th>{t.x('Role', 'Uruhare')}</th><th>{t.x('Scope', 'Aho akorera')}</th>
              <th>{t.x('Status', 'Imimerere')}</th><th>{t.x('Actions', 'Ibikorwa')}</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((u) => {
              const meta = ROLES[u.role] || {};
              const isBeneficiary = u.role === 'BENEFICIARY';
              const self = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.fullName}{self && <span className="chip-e"> ({t.x('you', 'wowe')})</span>}</td>
                  <td style={{ fontSize: 13 }}>{u.email}</td>
                  <td>
                    {isBeneficiary || self ? (
                      <span className="badge" style={{ background: meta.bg, color: meta.color }}>{t(meta.key || u.role)}</span>
                    ) : (
                      <select className="app-select" style={{ maxWidth: 150, padding: '6px 8px' }} value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                        {STAFF_ROLES.map((r) => <option key={r} value={r}>{t(ROLES[r].key)}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{scopeOf(u)}</td>
                  <td><Badge tone={u.status === 'ACTIVE' ? 'green' : 'gray'}>{t(u.status || 'ACTIVE')}</Badge></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn ghost sm" disabled={self} onClick={() => toggleStatus(u)}>
                        {u.status === 'ACTIVE' ? t.x('Deactivate', 'Hagarika') : t.x('Activate', 'Subiza')}
                      </button>
                      <button className="btn red sm" disabled={self} onClick={() => remove(u)}>{t.x('Delete', 'Siba')}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <small className="hint" style={{ display: 'block', marginTop: 12 }}>
          🔐 {t.x('Officers create and update records; beneficiaries read only their own; providers search and offer but cannot edit; administrators configure the system without silently altering beneficiary data.',
            'RBAC: umukozi ahindura; uwunguka areba uwe gusa; provider ashakisha atari uguhindura; admin agena sisitemu.')}
        </small>
      </Card>

      <Card style={{ marginTop: 16, maxWidth: 820 }}>
        <div className="card-t">{t.x('Create a staff account', 'Kora konti y’umukozi')}</div>
        <div className="form-grid">
          <div><label className="field-label">{t.x('Full name', 'Amazina')} *</label><input className="app-input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
          <div><label className="field-label">{t.x('Email', 'Imeyili')} *</label><input type="email" className="app-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label className="field-label">{t.x('Temporary password', 'Ijambobanga')} *</label><input type="password" className="app-input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="min 8 chars" /></div>
          <div><label className="field-label">{t.x('Role', 'Uruhare')}</label>
            <select className="app-select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {STAFF_ROLES.map((r) => <option key={r} value={r}>{t(ROLES[r].key)}</option>)}
            </select>
          </div>
          {f.role === 'OFFICER' && (
            <div><label className="field-label">{t.x('Sector', 'Umurenge')}</label><input className="app-input" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} placeholder="Kamonyi" /></div>
          )}
          {f.role === 'PROVIDER' && (
            <div><label className="field-label">{t.x('Provider organisation', 'Umuryango')}</label>
              <select className="app-select" value={f.providerId} onChange={(e) => setF({ ...f, providerId: e.target.value })}>
                <option value="">{t.x('Select…', 'Hitamo…')}</option>
                {(providers.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="app-button" style={{ marginTop: 14 }} onClick={create} disabled={busy}>
          {busy ? t.x('Creating…', 'Birakorwa…') : t.x('Create account', 'Kora konti')}
        </button>
      </Card>
    </>
  );
}
