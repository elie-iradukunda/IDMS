import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Mail, Lock, ShieldCheck, Shield, LockKeyhole, Users, HeartHandshake } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { ROLES, DEMO_ACCOUNTS, DEMO_PASSWORD, SHOW_DEMO_ACCOUNTS, roleHome } from '../lib/constants.js';
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

  const pillars = [
    {
      icon: <Shield className="h-6 w-6 text-emerald-100" />,
      title: t.x('Inclusive', 'Bose'),
      desc: t.x('Everyone belongs', 'Buri wese arisanga'),
    },
    {
      icon: <LockKeyhole className="h-6 w-6 text-emerald-100" />,
      title: t.x('Secure', 'Umutekano'),
      desc: t.x('Protected data, trusted access', 'Amakuru arinzwe'),
    },
    {
      icon: <Users className="h-6 w-6 text-emerald-100" />,
      title: t.x('Coordinated', 'Guhuza'),
      desc: t.x('Connected services, better outcomes', 'Serivisi zihujwe'),
    },
    {
      icon: <HeartHandshake className="h-6 w-6 text-emerald-100" />,
      title: t.x('Supportive', 'Ubufasha'),
      desc: t.x('Compassionate community', 'Gufatanya n’abaturage'),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100/90 flex flex-col justify-between" style={{ zoom: a.zoom }}>
      {/* Top A11y Controls */}
      <div className="flex justify-end px-6 pt-3">
        <A11yBar />
      </div>

      {/* Main Container */}
      <div className="w-full max-w-[1360px] mx-auto p-3 sm:p-6 lg:p-8 flex-1 flex items-center">
        <div className="w-full grid lg:grid-cols-[1.18fr_1fr] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 min-h-[680px]">

          {/* ── LEFT HERO PANEL with Wallpaper (Clear & Visible) ────────────────────────── */}
          <div
            className="relative p-8 sm:p-12 lg:p-14 flex flex-col justify-between overflow-hidden text-white bg-cover bg-center"
            style={{
              backgroundImage: `linear-gradient(to bottom, rgba(15, 23, 42, 0.65) 0%, rgba(15, 23, 42, 0.15) 35%, rgba(15, 23, 42, 0.35) 60%, rgba(15, 23, 42, 0.85) 100%), url('/login-bg.jpg')`,
            }}
          >
            {/* Top Brand Header */}
            <div className="relative z-10 flex items-center gap-4 bg-slate-900/50 backdrop-blur-md p-3.5 rounded-2xl border border-white/20 w-fit">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 border border-emerald-300/40 text-xl font-black italic tracking-tighter shadow-md">
                IDS
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-white">{t('appName')}</h2>
                <p className="text-xs font-medium text-emerald-300">{t.x('Inclusive registry & support coordination', 'Registry ibarura n’ubufasha bw’abafite ubumuga')}</p>
                <p className="text-[10px] font-semibold tracking-wider uppercase text-emerald-200 mt-0.5">Kamonyi District</p>
              </div>
            </div>

            {/* Center Content with subtle frosted background for readability */}
            <div className="relative z-10 my-6 max-w-xl bg-slate-950/45 backdrop-blur-sm p-6 rounded-3xl border border-white/15">
              <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-extrabold leading-[1.22] tracking-tight text-white drop-shadow-md">
                {t.x('One centralised registry. Support that reaches the right people.', 'Registry imwe. Ubufasha bugera ku bakwiye.')}
              </h1>
              <p className="mt-3 text-[14px] sm:text-[15px] text-slate-100 leading-relaxed font-normal">
                {t.x(
                  'A single accessible record coordinates support for persons with disabilities across Kamonyi District — with a recorded reason for every decision.',
                  "Inyandiko imwe igera kuri bose ihuza ubufasha bw'abafite ubumuga muri Kamonyi — buri cyemezo gifite impamvu yanditse.",
                )}
              </p>
            </div>

            {/* 4 Circular Pillars */}
            <div className="relative z-10 pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {pillars.map((p) => (
                <div key={p.title} className="flex flex-col items-center text-center group bg-slate-900/60 backdrop-blur-md p-3 rounded-2xl border border-white/20">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/20 border border-emerald-300/40 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-200 mb-1.5">
                    {p.icon}
                  </div>
                  <span className="font-bold text-xs text-white tracking-wide">{p.title}</span>
                  <span className="text-[10px] text-slate-200 leading-tight mt-0.5">{p.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT FORM PANEL ────────────────────────────────────── */}
          <div className="relative p-8 sm:p-12 lg:p-14 flex flex-col justify-between bg-white">
            {/* Dot Pattern Accent Top Right */}
            <div className="absolute top-6 right-8 grid grid-cols-6 gap-2 opacity-25 pointer-events-none">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              ))}
            </div>

            <div>
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {t.x('Welcome back', 'Murakaza neza')}
                </h2>
                <p className="mt-1.5 text-sm text-slate-500 font-medium">
                  {t.x('Sign in to the dashboard for your role.', 'Injira muri dashboard y’uruhare rwawe.')}
                </p>
              </div>

              {/* Login Form */}
              <form className="space-y-4" onSubmit={submit}>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2" htmlFor="em">
                    {t('email')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-5 w-5" />
                    </div>
                    <input
                      id="em"
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck="false"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition duration-150 outline-none"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setErr(''); }}
                      placeholder="name@domain.rw"
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="pw">
                      {t('password')}
                    </label>
                    <Link to="/forgot-password" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition">
                      {t.x('Forgot your password?', 'Wibagiwe ijambobanga?')}
                    </Link>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-5 w-5" />
                    </div>
                    <input
                      id="pw"
                      type="password"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10 transition duration-150 outline-none"
                      value={pw}
                      onChange={(e) => { setPw(e.target.value); setErr(''); }}
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                {err && (
                  <div className="rounded-xl p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold" role="alert">
                    {err}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-[#08542b] hover:bg-[#064222] text-white font-bold py-3.5 px-4 text-sm shadow-md hover:shadow-lg transition duration-150 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {busy ? t.x('Signing in…', 'Kwinjira…') : t.x('Log in', 'Injira')}
                </button>
              </form>

              {/* Demo Accounts Section */}
              {SHOW_DEMO_ACCOUNTS && (
                <div className="mt-7">
                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink mx-4 text-xs font-medium text-slate-400">or</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                  </div>

                  <p className="text-xs font-bold text-slate-800 mb-3 mt-1">
                    {t.x('Demo accounts (tap to sign in)', 'Konti z’igerageza (kanda winjire)')}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {DEMO_ACCOUNTS.map((roleKey) => {
                      const r = ROLES[roleKey];
                      return (
                        <button
                          key={roleKey}
                          type="button"
                          onClick={() => doLogin(r.email, DEMO_PASSWORD)}
                          disabled={busy}
                          className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-emerald-50/70 hover:border-emerald-300 transition-all text-left group"
                        >
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 shadow-sm"
                            style={{ background: r.bg }}
                          >
                            {r.ico}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-800 truncate">
                              {r.title || t(r.key)}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {r.email}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Quote & Footer */}
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="max-w-sm">
                <span className="text-emerald-700 font-serif text-2xl leading-none block -mb-1">“</span>
                <p className="text-xs font-medium text-slate-600 italic">
                  {t.x('Accessibility is not a feature, it’s our foundation.', 'Kugera kuri bose si inyongera, ni urufatiro rwacu.')}
                </p>
                <div className="w-8 h-0.5 bg-emerald-600 mt-2 rounded-full" />
              </div>
              <div className="text-slate-300 text-3xl select-none">
                🤝
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="py-2 text-center text-xs text-slate-400">
        Disability Support IMS · Kamonyi District
      </div>
    </div>
  );
}

