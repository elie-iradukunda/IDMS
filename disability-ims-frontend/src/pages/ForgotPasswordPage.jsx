import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mail, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { post } from '../lib/api.js';
import { useUI } from '../context/UIContext.jsx';
import A11yBar from '../components/A11yBar.jsx';

// ─────────────────────────────────────────────────────────────
// Password recovery.
//
// Beneficiaries and staff are both issued a temporary password by email and
// told to change it. Without a recovery path, anyone who loses that password
// — which is most likely to be the person with a cognitive or visual
// impairment the system exists to serve — has to reach an administrator by
// telephone to get back into their own record. That is precisely the
// officer-mediated dependency the registry is meant to reduce.
//
// The backend emails a single-use code valid for one hour and deliberately
// answers the same way whether or not the address is registered, so this
// screen cannot be used to discover who is on the registry. The wording here
// has to match that: it says the code was sent *if* the address is known.
// ─────────────────────────────────────────────────────────────
export default function ForgotPasswordPage() {
  const { t, a } = useUI();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // 'request' → ask for a code · 'reset' → enter the code and a new password
  const [step, setStep] = useState(params.get('token') ? 'reset' : 'request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const emailRef = useRef(null);
  const tokenRef = useRef(null);

  useEffect(() => {
    (step === 'request' ? emailRef : tokenRef).current?.focus();
  }, [step]);

  async function requestCode(e) {
    e?.preventDefault?.();
    setErr('');
    if (!email.trim()) return setErr(t.x('Enter the email address of your account.', 'Andika imeyili ya konti yawe.'));
    setBusy(true);
    try {
      const res = await post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setNote(t.x(
        'If that address has an account, a single-use code has been emailed to it. It is valid for one hour.',
        'Niba iyo imeyili ifite konti, kode yoherejwe kuri yo. Imara isaha imwe.',
      ));
      // Development convenience: the API returns the code when NODE_ENV is
      // development, so the flow can be exercised without a mail provider.
      if (res.devResetToken) setToken(res.devResetToken);
      setStep('reset');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e) {
    e?.preventDefault?.();
    setErr('');
    if (!token.trim()) return setErr(t.x('Paste the code from the email.', 'Andika kode yo muri imeyili.'));
    if (password.length < 8) {
      return setErr(t.x('The new password must be at least 8 characters.', 'Ijambobanga rishya rigomba kuba nibura inyuguti 8.'));
    }
    if (password !== confirm) {
      return setErr(t.x('The two passwords do not match.', 'Amagambobanga abiri ntahura.'));
    }
    setBusy(true);
    try {
      await post('/auth/reset-password', { token: token.trim(), password });
      setDone(true);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap bg-slate-100" style={{ zoom: a.zoom }}>
      <div className="flex justify-end px-4 pt-4">
        <A11yBar />
      </div>

      <div className="px-4 pb-10 pt-4 sm:px-6">
        <div className="mx-auto max-w-lg overflow-hidden rounded-[2rem] border border-border bg-surface shadow-2xl">
          <div className="sky-grad px-7 py-8 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-lg font-semibold">{t.x('Recover your password', 'Gusubiranya ijambobanga')}</p>
                <p className="text-sm text-white/70">{t('appName')}</p>
              </div>
            </div>
          </div>

          <div className="p-7">
            {done ? (
              <div className="success" style={{ marginTop: 0 }}>
                <div className="big" aria-hidden="true">✅</div>
                <div style={{ fontWeight: 800, fontSize: 17, marginTop: 6 }}>
                  {t.x('Your password has been changed', 'Ijambobanga ryawe ryahinduwe')}
                </div>
                <p style={{ color: 'var(--muted)', marginTop: 8, lineHeight: 1.55 }}>
                  {t.x('The code you used has now been spent and cannot be used again. Sign in with your new password.',
                    'Kode wakoresheje ntikizongera gukoreshwa. Injira ukoresheje ijambobanga rishya.')}
                </p>
                <div className="row-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
                  <button className="btn" onClick={() => navigate('/login', { replace: true })}>
                    {t('login')}
                  </button>
                </div>
              </div>
            ) : step === 'request' ? (
              <form onSubmit={requestCode} noValidate>
                <p className="page-sub" style={{ marginTop: 0 }}>
                  {t.x('Enter the email address your account uses. We will send a single-use code to it.',
                    'Andika imeyili konti yawe ikoresha. Tuzakoherereza kode ikoreshwa rimwe.')}
                </p>

                <div style={{ marginTop: 18 }}>
                  <label className="field-label" htmlFor="fp-email">{t('email')}</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-2" aria-hidden="true" />
                    <input
                      ref={emailRef} id="fp-email" type="email" inputMode="email"
                      autoCapitalize="none" spellCheck="false" autoComplete="username"
                      className="app-input pl-11" placeholder="name@domain.rw"
                      value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }}
                    />
                  </div>
                </div>

                {err && <div className="warn" role="alert">{err}</div>}

                <button className="app-button w-full" type="submit" disabled={busy} style={{ marginTop: 18 }}>
                  {busy ? t.x('Sending…', 'Birohereza…') : t.x('Email me a code', 'Nyoherereza kode')}
                </button>

                <small className="hint" style={{ display: 'block', marginTop: 14 }}>
                  {t.x('If you have no email address on file, your local officer or an administrator can issue you a new password directly.',
                    "Niba nta imeyili ufite, umukozi w'akarere cyangwa umuyobozi ashobora kuguha irindi.")}
                </small>
              </form>
            ) : (
              <form onSubmit={resetPassword} noValidate>
                {note && (
                  <div className="modal-current" role="status">{note}</div>
                )}

                <div style={{ marginTop: 18 }}>
                  <label className="field-label" htmlFor="fp-token">
                    {t.x('Code from the email', 'Kode yo muri imeyili')} *
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-2" aria-hidden="true" />
                    <input
                      ref={tokenRef} id="fp-token" className="app-input pl-11"
                      autoCapitalize="none" spellCheck="false" autoComplete="one-time-code"
                      value={token} onChange={(e) => { setToken(e.target.value); setErr(''); }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <label className="field-label" htmlFor="fp-pw">{t.x('New password', 'Ijambobanga rishya')} *</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-2" aria-hidden="true" />
                    <input
                      id="fp-pw" type="password" className="app-input pl-11" autoComplete="new-password"
                      value={password} onChange={(e) => { setPassword(e.target.value); setErr(''); }}
                    />
                  </div>
                  <small className="hint">{t.x('At least 8 characters.', 'Nibura inyuguti 8.')}</small>
                </div>

                <div style={{ marginTop: 14 }}>
                  <label className="field-label" htmlFor="fp-cnf">{t.x('Confirm new password', 'Ongera wandike')} *</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-2" aria-hidden="true" />
                    <input
                      id="fp-cnf" type="password" className="app-input pl-11" autoComplete="new-password"
                      value={confirm} onChange={(e) => { setConfirm(e.target.value); setErr(''); }}
                    />
                  </div>
                </div>

                {err && <div className="warn" role="alert">{err}</div>}

                <button className="app-button w-full" type="submit" disabled={busy} style={{ marginTop: 18 }}>
                  {busy ? t.x('Saving…', 'Birabikwa…') : t.x('Set new password', 'Shyiraho ijambobanga')}
                </button>

                <button
                  type="button" className="btn ghost sm" style={{ marginTop: 12 }}
                  onClick={() => { setStep('request'); setErr(''); setNote(''); }}
                >
                  {t.x('Send the code again', 'Ongera wohereze kode')}
                </button>
              </form>
            )}

            <div className="mt-7 border-t border-border pt-5">
              <Link to="/login" className="btn ghost sm" style={{ textDecoration: 'none' }}>
                <ArrowLeft className="h-[14px] w-[14px]" aria-hidden="true" />
                {t.x('Back to sign in', 'Subira ku kwinjira')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
