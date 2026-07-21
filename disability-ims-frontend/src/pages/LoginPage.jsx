import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { ROLES, DEMO_ACCOUNTS, DEMO_PASSWORD, roleHome } from '../lib/constants.js';
import A11yBar from '../components/A11yBar.jsx';

export default function LoginPage() {
  const { user, ready, login } = useAuth();
  const { a, t } = useUI();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (ready && user) return <Navigate to={roleHome(user.role)} replace />;

  async function doLogin(nextEmail, nextPw) {
    setBusy(true);
    setErr('');
    try {
      const u = await login(nextEmail.trim().toLowerCase(), nextPw);
      navigate(roleHome(u.role), { replace: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e) {
    e?.preventDefault?.();
    if (!email.trim()) return setErr(t.x('Enter your email.', 'Andika imeyili yawe.'));
    if (!pw) return setErr(t.x('Enter a password.', 'Andika ijambobanga.'));
    doLogin(email, pw);
  }

  const steps = [
    [t(ROLES.OFFICER.key), t.x('Register, maintain records and coordinate support', 'Andika, ubungabunge inyandiko, uhuze ubufasha')],
    [t(ROLES.BENEFICIARY.key), t.x('View your record, support status and messages', 'Reba umwirondoro, ubufasha n’ubutumwa')],
    [t(ROLES.PROVIDER.key), t.x('Search by recorded need and offer support', 'Shakisha ukurikije ubukene, utange ubufasha')],
    [t(ROLES.ADMIN.key), t.x('Reports, users, announcements and audit', 'Raporo, abakoresha, amatangazo na audit')],
  ];

  return (
    <div className="login-wrap bg-slate-100" style={{ zoom: a.zoom }}>
      <div className="flex justify-end px-4 pt-4">
        <A11yBar />
      </div>
      <div className="px-4 pb-10 pt-4 sm:px-6">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] border border-border bg-surface shadow-2xl lg:grid-cols-[0.92fr_1.08fr]">
          {/* Brand panel */}
          <section className="sky-grad p-8 text-white sm:p-10">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-lg font-black italic tracking-tighter">
                IDS
              </div>
              <div>
                <p className="text-xl font-semibold">{t('appName')}</p>
                <p className="text-sm text-white/70">{t('tagline')}</p>
              </div>
            </div>

            <div className="mt-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm">
                <ShieldCheck className="h-4 w-4" />
                {t.x('Inclusive · four-role secure access', 'Bose · uburenganzira bw’inzego enye')}
              </div>
              <h1 className="mt-6 text-3xl font-semibold leading-tight sm:text-4xl">
                {t.x('One centralised registry. Support that reaches the right people.', 'Registry imwe. Ubufasha bugera ku bakwiye.')}
              </h1>
              <p className="mt-4 max-w-xl text-white/80">
                {t.x(
                  'A single accessible record coordinates support for persons with disabilities across Kamonyi District — with a recorded reason for every decision.',
                  "Inyandiko imwe igera kuri bose ihuza ubufasha bw'abafite ubumuga muri Kamonyi — buri cyemezo gifite impamvu yanditse.",
                )}
              </p>
            </div>

            <div className="mt-10 space-y-3">
              {steps.map(([title, description], index) => (
                <div key={title} className="rounded-2xl border border-white/15 bg-white/10 p-4">
                  <div className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold" style={{ color: 'var(--brand-dark)' }}>
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="mt-1 text-sm text-white/75">{description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Form panel */}
          <section className="p-6 sm:p-10">
            <h2 className="text-2xl font-semibold text-text">{t.x('Welcome back', 'Murakaza neza')}</h2>
            <p className="mt-2 text-sm text-muted">{t.x('Sign in to the dashboard for your role.', 'Injira muri dashboard y’uruhare rwawe.')}</p>

            <form className="mt-7 space-y-5" onSubmit={submit}>
              <div>
                <label className="field-label" htmlFor="em">{t('email')}</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-2" />
                  <input
                    id="em"
                    className="app-input pl-11"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErr(''); }}
                    placeholder="name@domain.rw"
                    autoComplete="username"
                  />
                </div>
              </div>
              <div>
                <label className="field-label" htmlFor="pw">{t('password')}</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-2" />
                  <input
                    id="pw"
                    type="password"
                    className="app-input pl-11"
                    value={pw}
                    onChange={(e) => { setPw(e.target.value); setErr(''); }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
              </div>
              {err && <p className="rounded-2xl p-3 text-sm font-semibold" style={{ color: 'var(--red)', background: 'var(--red-soft)' }} role="alert">{err}</p>}
              <button className="app-button w-full" type="submit" disabled={busy}>
                {busy ? t.x('Signing in…', 'Kwinjira…') : t('login')}
              </button>
            </form>

            <div className="mt-8 border-t border-border pt-7">
              <h3 className="font-semibold text-text">{t('demo')}</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {DEMO_ACCOUNTS.map((roleKey) => {
                  const r = ROLES[roleKey];
                  return (
                    <button key={roleKey} type="button" className="chip" onClick={() => doLogin(r.email, DEMO_PASSWORD)} disabled={busy}>
                      <span className="chip-ico" style={{ background: r.bg }}>{r.ico}</span>
                      <span className="min-w-0">
                        <div className="chip-t">{t(r.key)}</div>
                        <div className="chip-e truncate">{r.email}</div>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
