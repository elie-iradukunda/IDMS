import { useState, useRef } from 'react';
import { UserPlus, Pencil, KeyRound, Power, Trash2, Mail, Send } from 'lucide-react';
import { post, patch, del } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { ROLES, SECTORS } from '../../lib/constants.js';
import { Card, Badge, Loading, ErrorState, Empty } from '../../components/ui.jsx';
import { FormModal, ConfirmModal } from '../../components/Modal.jsx';

const ALL_ROLES = ['OFFICER', 'PROVIDER', 'ADMIN', 'BENEFICIARY'];
const BLANK = { fullName: '', email: '', password: '', role: 'OFFICER', sector: '', providerId: '', inviteViaEmail: true };

// Full user & role management: create users (Admin, Officer, Provider, Beneficiary),
// invite them via email with a secure password reset link, change roles,
// deactivate/reactivate, reset passwords and delete.
export default function UsersPage() {
  const { t } = useUI();
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useFetch('/admin/users');
  const providers = useFetch('/admin/providers');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [dialog, setDialog] = useState(null);

  const close = () => setDialog(null);
  const done = () => { close(); reload(); };

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const term = q.toLowerCase();
  const rows = (data || []).filter((u) =>
    (role === 'all' || u.role === role)
    && [u.fullName, u.email, u.sector].filter(Boolean).join(' ').toLowerCase().includes(term));

  const scopeOf = (u) => u.sector
    || (u.beneficiaryId ? `${t.x('Record', 'Inyandiko')} #${u.beneficiaryId}` : null)
    || (u.providerId ? (providers.data || []).find((p) => p.id === u.providerId)?.name || `#${u.providerId}` : null)
    || '—';

  return (
    <>
      <div className="toolbar">
        <div className="grow">
          <label htmlFor="uq" className="sr-only">{t.x('Search users', 'Shakisha')}</label>
          <input id="uq" className="input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t.x('Search by name, email or sector…', 'Shakisha izina, imeyili…')} />
        </div>
        <select className="app-select" style={{ maxWidth: 200 }} value={role}
          onChange={(e) => setRole(e.target.value)} aria-label={t.x('Filter by role', 'Shungura')}>
          <option value="all">{t.x('All roles', 'Inshingano zose')}</option>
          {Object.keys(ROLES).map((r) => <option key={r} value={r}>{t(ROLES[r].key)}</option>)}
        </select>
        <button className="app-button" onClick={() => setDialog({ kind: 'create' })}>
          <UserPlus className="h-[16px] w-[16px]" aria-hidden="true" style={{ marginRight: 7 }} />
          {t.x('Create user account', "Kora konti y'umukoresha")}
        </button>
      </div>

      <Card style={{ marginTop: 16 }}>
        <div className="card-t">{t.x('Users & role permissions', 'Abakoresha & uburenganzira')}</div>
        {rows.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <caption className="sr-only">{t.x('All system user accounts and their roles', 'Konti zose za sisitemu')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.x('Name', 'Izina')}</th>
                  <th scope="col">{t.x('Email', 'Imeyili')}</th>
                  <th scope="col">{t.x('Role', 'Uruhare')}</th>
                  <th scope="col">{t.x('Scope', 'Aho akorera')}</th>
                  <th scope="col">{t.x('Status', 'Imimerere')}</th>
                  <th scope="col">{t.x('Actions', 'Ibikorwa')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const meta = ROLES[u.role] || {};
                  const self = u.id === me?.id;
                  const isBeneficiaryWithRecord = u.role === 'BENEFICIARY' && !!u.beneficiaryId;
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>
                        {u.fullName}{self && <span className="chip-e"> ({t.x('you', 'wowe')})</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{u.email}</td>
                      <td>
                        <span className="badge" style={{ background: meta.bg, color: meta.color }}>
                          {t(meta.key || u.role)}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{scopeOf(u)}</td>
                      <td><Badge tone={u.status === 'ACTIVE' ? 'green' : 'gray'}>{t(u.status || 'ACTIVE')}</Badge></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn ghost sm"
                            onClick={() => setDialog({ kind: 'invite', u })}
                            title={t.x('Send password reset / invitation email', 'Ohereza ubutumire / link yo guhindura ijambobanga')}
                            aria-label={t.x(`Invite ${u.fullName} via email`, `Koherereza ubutumire ${u.fullName}`)}>
                            <Mail className="h-[14px] w-[14px]" aria-hidden="true" />
                          </button>
                          <button className="btn ghost sm"
                            onClick={() => setDialog({ kind: 'edit', u })}
                            aria-label={t.x(`Edit ${u.fullName}`, `Hindura ${u.fullName}`)}>
                            <Pencil className="h-[14px] w-[14px]" aria-hidden="true" />
                          </button>
                          <button className="btn ghost sm"
                            onClick={() => setDialog({ kind: 'reset', u })}
                            aria-label={t.x(`Reset password for ${u.fullName}`, `Guhindura ijambobanga`)}>
                            <KeyRound className="h-[14px] w-[14px]" aria-hidden="true" />
                          </button>
                          <button className="btn ghost sm" disabled={self}
                            onClick={() => setDialog({ kind: 'status', u })}
                            aria-label={t.x(`Change status of ${u.fullName}`, `Hindura imimerere`)}>
                            <Power className="h-[14px] w-[14px]" aria-hidden="true" />
                          </button>
                          <button className="btn red sm" disabled={self || isBeneficiaryWithRecord}
                            onClick={() => setDialog({ kind: 'delete', u })}
                            title={isBeneficiaryWithRecord ? t.x('Beneficiary accounts linked to the registry are archived from the registry', 'Bicungirwa muri registry') : ''}
                            aria-label={t.x(`Delete ${u.fullName}`, `Siba ${u.fullName}`)}>
                            <Trash2 className="h-[14px] w-[14px]" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty title={t.x('No matching users', 'Nta wabonetse')} />}

        <small className="hint" style={{ display: 'block', marginTop: 12 }}>
          🔐 {t.x(
            'Administrators can create all user types (Officers, Providers, Beneficiaries, Admins) and invite them via email with a secure link to set their passwords.',
            'Ubuyobozi bushobora kurema abakoresha bose no kuboherereza ubutumire kuri imeyili bishyiriraho ijambobanga.')}
        </small>
      </Card>

      {dialog?.kind === 'create' && <UserDialog providers={providers.data || []} onClose={close} onDone={done} />}
      {dialog?.kind === 'edit' && <UserDialog u={dialog.u} providers={providers.data || []} onClose={close} onDone={done} />}
      {dialog?.kind === 'invite' && <InviteDialog u={dialog.u} onClose={close} onDone={done} />}
      {dialog?.kind === 'status' && <StatusDialog u={dialog.u} onClose={close} onDone={done} />}
      {dialog?.kind === 'reset' && <ResetDialog u={dialog.u} onClose={close} onDone={done} />}
      {dialog?.kind === 'delete' && <DeleteDialog u={dialog.u} onClose={close} onDone={done} />}
    </>
  );
}

// ── Create / edit a user account ────────────────────────────
function UserDialog({ u, providers, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const editing = !!u;
  const [f, setF] = useState(editing
    ? { fullName: u.fullName, email: u.email, password: '', role: u.role, sector: u.sector || '', providerId: u.providerId || '', inviteViaEmail: false }
    : BLANK);
  const m = useMutation();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = () => {
    if (!f.fullName.trim() || !f.email.trim()) {
      return m.setError(t.x('Name and email are required.', "Izina n'imeyili birakenewe."));
    }
    if (!editing && !f.inviteViaEmail && f.password && f.password.length < 8) {
      return m.setError(t.x('Password must be at least 8 characters, or leave it blank to have one generated.',
        'Ijambobanga rigomba kuba nibura inyuguti 8.'));
    }
    if (f.role === 'PROVIDER' && !f.providerId) {
      return m.setError(t.x('Select a provider organisation.', 'Hitamo umuryango.'));
    }
    const body = {
      fullName: f.fullName.trim(),
      email: f.email.trim(),
      role: f.role,
      sector: f.role === 'OFFICER' ? f.sector : null,
      providerId: f.role === 'PROVIDER' ? Number(f.providerId) : null,
    };
    if (!editing) {
      body.inviteViaEmail = f.inviteViaEmail;
      if (!f.inviteViaEmail && f.password) {
        body.password = f.password;
      }
    }

    return m.run(
      () => (editing ? patch(`/admin/users/${u.id}`, body) : post('/admin/users', body)),
      {
        success: editing
          ? t.x('Account updated', 'Byavuguruwe')
          : f.inviteViaEmail
            ? t.x('User account created — password invitation emailed!', 'Konti yakozwe — ubutumire bwoherejwe kuri imeyili!')
            : t.x('User account created — credentials emailed', 'Konti yakozwe — imeyili yoherejwe'),
        then: onDone,
      },
    );
  };

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={editing ? t.x(`Edit ${u.fullName}`, `Hindura ${u.fullName}`) : t.x('Create a user account', "Kora konti y'umukoresha")}
      subtitle={editing
        ? t.x('Permissions attach to the role. Updating the role immediately changes access for this account.',
          'Uburenganzira bushingira ku ruhare. Guhindura uruhare bihindura ubushobozi bwose bwa konti.')
        : t.x('Create an account and invite the user via email with a secure link to set their own password.',
          'Kora konti maze wohereze ubutumire kuri imeyili kugira ngo umukoresha yishyirireho ijambobanga.')}
      submitLabel={editing ? t.x('Save changes', 'Bika') : t.x('Create user & send invitation', 'Kora konti & Ohereza ubutumire')}
      onSubmit={submit}
    >
      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="u-name">{t.x('Full name', 'Amazina')} *</label>
          <input ref={first} id="u-name" className="app-input" value={f.fullName} onChange={set('fullName')} placeholder="e.g. Jean Damascene Nzeyimana" />
        </div>
        <div>
          <label className="field-label" htmlFor="u-email">{t.x('Email address', 'Imeyili')} *</label>
          <input id="u-email" type="email" className="app-input" value={f.email} onChange={set('email')} placeholder="user@domain.rw" />
        </div>
        <div>
          <label className="field-label" htmlFor="u-role">{t.x('Role & permissions', 'Uruhare & Uburenganzira')}</label>
          <select id="u-role" className="app-select" value={f.role} onChange={set('role')}>
            {ALL_ROLES.map((r) => <option key={r} value={r}>{t(ROLES[r]?.key || r)}</option>)}
          </select>
        </div>

        {!editing && (
          <div style={{ gridColumn: '1 / -1', background: 'var(--surface-2)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: 'var(--ink)' }}>
              {t.x('Password & Onboarding Method', 'Uburyo bwo gushyiraho ijambobanga')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="inviteMode"
                  checked={f.inviteViaEmail === true}
                  onChange={() => setF({ ...f, inviteViaEmail: true, password: '' })}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    {t.x('Invite via email (Recommended)', 'Ohereza ubutumire kuri imeyili (Byiza cyane)')}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    {t.x('Sends an email invitation containing a secure link where the user sets their password.',
                      'Bimwoherereza imeyili irimo link yo kwishyiriraho ijambobanga rishya.')}
                  </div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginTop: 4 }}>
                <input
                  type="radio"
                  name="inviteMode"
                  checked={f.inviteViaEmail === false}
                  onChange={() => setF({ ...f, inviteViaEmail: false })}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                    {t.x('Set manual or temporary password', "Shyiraho ijambobanga ry'agateganyo")}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    {t.x('Specify a password now, or leave blank to generate a temporary one.',
                      'Andika ijambobanga cyangwa usige ubusa rikorwe n\'ubundi.')}
                  </div>
                </div>
              </label>
            </div>

            {!f.inviteViaEmail && (
              <div style={{ marginTop: 12 }}>
                <label className="field-label" htmlFor="u-pw">{t.x('Temporary password', "Ijambobanga ry'agateganyo")}</label>
                <input id="u-pw" type="password" className="app-input" value={f.password} onChange={set('password')}
                  placeholder={t.x('Leave blank to generate automatically', 'Reka ubusa ribe ryikora')} autoComplete="new-password" />
              </div>
            )}
          </div>
        )}

        {f.role === 'OFFICER' && (
          <div>
            <label className="field-label" htmlFor="u-sector">{t.x('Sector of responsibility', 'Umurenge akoreramo')}</label>
            <select id="u-sector" className="app-select" value={f.sector} onChange={set('sector')}>
              <option value="">{t.x('District-wide', 'Akarere kose')}</option>
              {SECTORS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <small className="hint">
              {t.x('Correction requests from this sector are routed to this officer.', 'Ibyifuzo byo gukosora bivuye muri uyu murenge bimugeraho.')}
            </small>
          </div>
        )}
        {f.role === 'PROVIDER' && (
          <div>
            <label className="field-label" htmlFor="u-prov">{t.x('Provider organisation', 'Umuryango')} *</label>
            <select id="u-prov" className="app-select" value={f.providerId} onChange={set('providerId')}>
              <option value="">{t.x('Select organisation…', 'Hitamo umuryango…')}</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!providers.length && (
              <small className="hint">
                {t.x('No organisations exist yet — create one under Provider organisations first.',
                  'Nta muryango uhari — banza ukore umwe.')}
              </small>
            )}
          </div>
        )}
      </div>
    </FormModal>
  );
}

// ── Send Email Invitation with Password Reset Link ──────────
function InviteDialog({ u, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone="green"
      title={t.x(`Invite ${u.fullName} via email?`, `Koherereza ubutumire ${u.fullName}?`)}
      message={t.x(
        `An email invitation with a secure link to set/reset their password will be sent to ${u.email}. The user will be able to click the button in the email and choose their password immediately.`,
        `Imeyili irimo link yo kwishyiriraho ijambobanga rishya igiye koherezwa kuri ${u.email}.`
      )}
      confirmLabel={t.x('Send invitation email', 'Ohereza ubutumire')}
      onConfirm={() => m.run(() => post(`/admin/users/${u.id}/invite`), {
        success: t.x('Invitation email sent successfully!', 'Ubutumire bwoherejwe neza!'),
        then: onDone,
      })}
    />
  );
}

function StatusDialog({ u, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  const deactivating = u.status === 'ACTIVE';
  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone={deactivating ? 'red' : 'green'}
      title={deactivating
        ? t.x(`Deactivate ${u.fullName}?`, `Guhagarika ${u.fullName}?`)
        : t.x(`Reactivate ${u.fullName}?`, `Gusubiza ${u.fullName}?`)}
      message={deactivating
        ? t.x('They will no longer be able to sign in, and are emailed to say so rather than being left to discover it. Their records and audit history are retained.',
          'Ntazongera kwinjira, kandi aramenyeshwa kuri imeyili. Amakuru ye aguma aho.')
        : t.x('Their sign-in is restored with the role and scope shown in the table.',
          'Azongera kwinjira afite uruhare rugaragara ku rutonde.')}
      confirmLabel={deactivating ? t.x('Deactivate', 'Hagarika') : t.x('Reactivate', 'Subiza')}
      onConfirm={() => m.run(() => patch(`/admin/users/${u.id}`, { status: deactivating ? 'INACTIVE' : 'ACTIVE' }), {
        success: deactivating ? t.x('User deactivated', 'Yahagaritswe') : t.x('User reactivated', 'Yasubijwe'),
        then: onDone,
      })}
    />
  );
}

function ResetDialog({ u, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone="green"
      title={t.x(`Reset password for ${u.fullName}?`, `Guhindura ijambobanga rya ${u.fullName}?`)}
      message={t.x('A new temporary password is generated and emailed to them. Their current password stops working immediately, and any outstanding reset link is cancelled.',
        "Bahabwa ijambobanga rishya kuri imeyili. Iry'ubu rihita rihagarara.")}
      confirmLabel={t.x('Reset & email password', 'Ohereza ijambobanga')}
      onConfirm={() => m.run(() => post(`/admin/users/${u.id}/reset-password`), {
        success: t.x('New password emailed', 'Imeyili yoherejwe'), then: onDone,
      })}
    />
  );
}

function DeleteDialog({ u, onClose, onDone }) {
  const { t } = useUI();
  const m = useMutation();
  return (
    <ConfirmModal
      open onClose={onClose} busy={m.busy} tone="red"
      title={t.x(`Delete ${u.email}?`, `Gusiba ${u.email}?`)}
      message={t.x('This removes the account permanently and cannot be undone. Their entries in the audit log are kept, so past actions stay attributable. If you only need to stop them signing in, deactivate the account instead.',
        'Ibi bisiba konti burundu. Ibyo yakoze biguma muri audit log. Niba ushaka kumubuza kwinjira gusa, mureke uhagarike konti.')}
      confirmLabel={t.x('Delete permanently', 'Siba burundu')}
      onConfirm={() => m.run(() => del(`/admin/users/${u.id}`), {
        success: t.x('User deleted', 'Yasibwe'), then: onDone,
      })}
    />
  );
}
