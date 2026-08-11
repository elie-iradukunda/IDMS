import { useState, useEffect, useCallback } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { get, getToken } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { roleHome } from '../lib/constants.js';
import { navByRole, roleMeta } from '../lib/navigation.js';
import { Loading } from './ui.jsx';
import Toast from './Toast.jsx';
import NotificationBell from './NotificationBell.jsx';

const initials = (name = '') =>
  name.split(' ').map((p) => p[0] || '').join('').slice(0, 2).toUpperCase();

function BrandMark() {
  const { t } = useUI();
  return (
    <div className="flex items-center gap-2.5">
      <span className="brandmark">IDS</span>
      <div className="h-7 w-px bg-white/30" />
      <div>
        <p className="text-[11px] font-bold tracking-wide text-white">{t('appName')}</p>
        <p className="text-[8px] uppercase tracking-[0.18em] text-white/60">Kamonyi District</p>
      </div>
    </div>
  );
}

function Sidebar({ role, onNavigate, badges = {} }) {
  const { a, t, logout } = useSidebarData();
  const items = navByRole[role] || [];
  return (
    <div className="sidebar">
      <div className="flex h-[72px] items-center border-b border-white/10 px-5">
        <BrandMark />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {items.map((item) => {
          const Icon = item.icon;
          const count = item.badge ? badges[item.badge] : 0;
          const label = a.lang === 'rw' ? item.rw : item.en;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              end={item.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon className="h-[17px] w-[17px]" />
              <span className="flex-1">{label}</span>
              {/* Work waiting behind a tab is work that ages unseen. */}
              {count > 0 && (
                <span
                  className="nav-count"
                  aria-label={a.lang === 'rw' ? `${count} bitegereje` : `${count} awaiting attention`}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button type="button" onClick={logout} className="sidebar-link w-full">
          <LogOut className="h-[17px] w-[17px]" />
          {t('logout')}
        </button>
      </div>
    </div>
  );
}

// small hook so Sidebar can read UI + auth without prop drilling
function useSidebarData() {
  const { a, t } = useUI();
  const { logout } = useAuth();
  return { a, t, logout };
}

// Counts for the sidebar badges. Only the officer has a queue that other
// people are waiting inside, so only the officer pays for the request.
const BADGE_POLL_MS = 60_000;

function useOfficerBadges(role, pathname) {
  const [badges, setBadges] = useState({});

  const refresh = useCallback(() => {
    // Same reasoning as the notification bell: no token, nothing to count —
    // and a tokenless poll would 401 and force a spurious logout.
    if (role !== 'OFFICER' || !getToken()) return;
    get('/officer/badges').then(setBadges).catch(() => {});
  }, [role]);

  // Refetch on navigation too: deciding a request should empty the badge that
  // sent the officer there, not leave a number that contradicts the page.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, BADGE_POLL_MS);
    return () => clearInterval(id);
  }, [refresh, pathname]);

  return badges;
}

function HeaderA11y() {
  const { a, setA, t } = useUI();
  const zoom = (v) => setA({ ...a, zoom: v });
  return (
    <div className="a11y" role="region" aria-label="Accessibility settings">
      <div className="grp">
        {['en', 'rw'].map((l) => (
          <button key={l} className={a.lang === l ? 'on' : ''} onClick={() => setA({ ...a, lang: l })} aria-pressed={a.lang === l}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="grp hidden sm:flex">
        <button onClick={() => zoom(Math.max(1, +(a.zoom - 0.1).toFixed(2)))} aria-label="Decrease text size">A−</button>
        <button onClick={() => zoom(1)} aria-label="Reset text size">A</button>
        <button onClick={() => zoom(Math.min(1.5, +(a.zoom + 0.1).toFixed(2)))} aria-label="Increase text size" style={{ fontSize: 15 }}>A+</button>
      </div>
      <div className="grp">
        <button className={a.hc ? 'on' : ''} onClick={() => setA({ ...a, hc: !a.hc })} aria-pressed={a.hc} aria-label="High contrast" title={t('contrast')}>
          ◐
        </button>
      </div>
    </div>
  );
}

// Authenticated frame + route guard. Green sidebar (Fuel "admin" theme) +
// white top header + slate content. Replaces the previous top-tab shell.
export default function DashboardLayout({ role }) {
  const { user, ready, logout } = useAuth();
  const { a, t } = useUI();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const badges = useOfficerBadges(user?.role, location.pathname);

  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={roleHome(user.role)} replace />;

  const meta = roleMeta[user.role] || {};

  return (
    <div className="min-h-screen bg-bg">
      <div className="grid min-h-screen lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block">
          <Sidebar role={user.role} badges={badges} />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden">
            <div className="relative h-full w-64 shadow-2xl">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-3 z-10 rounded-lg bg-white/10 p-2 text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
              <Sidebar role={user.role} badges={badges} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <div className="min-w-0 lg:col-start-2">
          <header className="app-header">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-border p-2.5 text-muted lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold text-text">{a.lang === 'rw' ? meta.rw : meta.en}</p>
              <p className="mt-0.5 text-xs text-muted-2">{a.lang === 'rw' ? meta.subRw : meta.subEn}</p>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <HeaderA11y />
              {user.role === 'BENEFICIARY' && <NotificationBell />}
              <div className="hidden h-8 w-px bg-border sm:block" />
              <div className="flex items-center gap-2.5">
                <span className="avatar h-9 w-9 text-xs sky-grad" aria-hidden="true">
                  {initials(user.fullName)}
                </span>
                <div className="hidden sm:block">
                  <p className="text-xs font-semibold text-text">{user.fullName}</p>
                  <p className="text-[10px] text-muted-2">{user.email}</p>
                </div>
              </div>
              <button className="btn ghost sm hidden lg:inline-flex" onClick={logout}>
                {t('logout')}
              </button>
            </div>
          </header>

          <main className="app-main" style={{ zoom: a.zoom }}>
            <Outlet />
          </main>
        </div>
      </div>
      <Toast />
    </div>
  );
}
