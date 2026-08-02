import { useState, useRef } from 'react';
import { KeyRound, Languages } from 'lucide-react';
import { post } from '../lib/api.js';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMutation } from '../lib/useMutation.js';
import { ROLES } from '../lib/constants.js';
import { Card, Badge } from '../components/ui.jsx';
import { FormModal } from '../components/Modal.jsx';

// Account settings, available to every role. Beneficiaries receive a
// temporary password by email at registration and are told to change it —
// which requires somewhere to change it. The language preference is stored
// on the account rather than only in this browser, so a user who signs in
// from a shared device or a phone gets their own language, not the last
// person's (localisation, Table 3.4).
export default function AccountPage() {
  const { t, a, setA } = useUI();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const lang = useMutation();

  const meta = ROLES[user?.role] || {};

  const setLanguage = (l) => lang.run(() => post('/me/language', { language: l }), {
    success: t.x('Language preference saved', 'Ururimi rwabitswe'),
    then: () => setA({ ...a, lang: l }),
    silent: false,
  });

  return (
    <>
      <Card style={{ marginTop: 22, maxWidth: 680 }}>
        <div className="card-t">{t.x('My account', 'Konti yanjye')}</div>
        <div className="rec">
          <div className="rl">{t.x('Name', 'Amazina')}</div>
          <span className="rr">{user?.fullName}</span>
          <div className="rl">{t.x('Email', 'Imeyili')}</div>
          <span className="rr">{user?.email}</span>
          <div className="rl">{t.x('Role', 'Uruhare')}</div>
          <span className="rr">
            <span className="badge" style={{ background: meta.bg, color: meta.color }}>
              {t(meta.key || user?.role)}
            </span>
          </span>
          {user?.sector && (
            <>
              <div className="rl">{t.x('Sector of responsibility', 'Umurenge akoreramo')}</div>
              <span className="rr">{user.sector}</span>
            </>
          )}
        </div>
        <small className="hint" style={{ display: 'block', marginTop: 12 }}>
          {t.x('Your name, email and role are set by an administrator (or, for a beneficiary, by your local officer) so that the audit log always names a real, verified person.',
            "Amazina, imeyili n'uruhare bishyirwaho n'umuyobozi cyangwa umukozi w'akarere.")}
        </small>
      </Card>

      <Card style={{ marginTop: 16, maxWidth: 680 }}>
        <div className="card-t">
          <Languages className="h-[16px] w-[16px]" aria-hidden="true" style={{ display: 'inline', marginRight: 7, verticalAlign: -2 }} />
          {t.x('Interface language', 'Ururimi rwa sisitemu')}
        </div>
        <small className="hint">
          {t.x('Saved to your account, so it follows you to any device rather than staying in this browser.',
            'Rubikwa kuri konti yawe, rukagukurikira kuri buri gikoresho.')}
        </small>
        <div className="row-actions">
          {[['en', 'English'], ['rw', 'Kinyarwanda']].map(([code, name]) => (
            <button key={code}
              className={`btn sm ${a.lang === code ? '' : 'ghost'}`}
              aria-pressed={a.lang === code}
              disabled={lang.busy}
              onClick={() => setLanguage(code)}>
              {name}
            </button>
          ))}
        </div>
      </Card>

      <Card style={{ marginTop: 16, maxWidth: 680 }}>
        <div className="card-t">
          <KeyRound className="h-[16px] w-[16px]" aria-hidden="true" style={{ display: 'inline', marginRight: 7, verticalAlign: -2 }} />
          {t.x('Password', 'Ijambobanga')}
        </div>
        <small className="hint">
          {t.x('If you signed in with a temporary password sent by email, change it now. Nobody else — including an administrator — can read your password; they can only issue a new one.',
            "Niba winjiye ukoresheje ijambobanga ry'agateganyo, rihindure ubu. Nta muntu ushobora kurisoma.")}
        </small>
        <div className="row-actions">
          <button className="btn sm" onClick={() => setOpen(true)}>
            {t.x('Change password', 'Hindura ijambobanga')}
          </button>
        </div>
      </Card>

      {open && <PasswordDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function PasswordDialog({ onClose }) {
  const { t } = useUI();
  const first = useRef(null);
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const m = useMutation();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <FormModal
      open onClose={onClose} size="sm" busy={m.busy} error={m.error} initialFocus={first}
      title={t.x('Change your password', 'Hindura ijambobanga')}
      subtitle={t.x('At least 8 characters. You stay signed in on this device after the change.',
        'Nibura inyuguti 8. Uzakomeza kuba winjiye kuri iki gikoresho.')}
      submitLabel={t.x('Change password', 'Hindura')}
      onSubmit={() => {
        if (f.newPassword.length < 8) {
          return m.setError(t.x('The new password must be at least 8 characters.', 'Rigomba kuba nibura inyuguti 8.'));
        }
        if (f.newPassword !== f.confirm) {
          return m.setError(t.x('The two new passwords do not match.', 'Amagambobanga abiri ntabwo ahura.'));
        }
        return m.run(
          () => post('/me/password', { currentPassword: f.currentPassword, newPassword: f.newPassword }),
          { success: t.x('Password changed', 'Ijambobanga ryahinduwe'), then: onClose },
        );
      }}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <label className="field-label" htmlFor="pw-cur">{t.x('Current password', "Ijambobanga ry'ubu")} *</label>
          <input ref={first} id="pw-cur" type="password" className="app-input" autoComplete="current-password"
            value={f.currentPassword} onChange={set('currentPassword')} />
        </div>
        <div>
          <label className="field-label" htmlFor="pw-new">{t.x('New password', 'Ijambobanga rishya')} *</label>
          <input id="pw-new" type="password" className="app-input" autoComplete="new-password"
            value={f.newPassword} onChange={set('newPassword')} />
        </div>
        <div>
          <label className="field-label" htmlFor="pw-cnf">{t.x('Confirm new password', 'Ongera wandike')} *</label>
          <input id="pw-cnf" type="password" className="app-input" autoComplete="new-password"
            value={f.confirm} onChange={set('confirm')} />
        </div>
      </div>
    </FormModal>
  );
}
