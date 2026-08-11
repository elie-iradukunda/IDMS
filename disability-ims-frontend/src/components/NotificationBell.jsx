import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { get, getToken } from '../lib/api.js';
import { useUI } from '../context/UIContext.jsx';

// ─────────────────────────────────────────────────────────────
// Unread indicator in the header.
//
// Decisions, deliveries and new opportunities are written as in-app
// notifications, but until now they were only visible to someone who thought
// to open the Messages tab. A beneficiary whose support request has just been
// declined has no reason to go looking — so the one message that most needed
// to reach them was the one least likely to. The bell carries that signal on
// every screen, and takes one click to act on it.
//
// It polls rather than holding a socket open: the district office shares one
// connection, and a minute of latency on a notification costs nothing next to
// a persistent connection per signed-in user.
// ─────────────────────────────────────────────────────────────
const POLL_MS = 60_000;

export default function NotificationBell() {
  const { t } = useUI();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    // A poll that fires between sign-out and unmount would be sent without a
    // token, earn a guaranteed 401, and trip the global unauthorized handler
    // for no reason. If there is no token there is nothing to count.
    if (!getToken()) return;
    get('/my/notifications/unread-count')
      .then((d) => setUnread(d.unread || 0))
      .catch(() => {});   // a failed count must never interrupt the page
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    // Coming back to the tab is the moment the number is most likely stale.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const label = unread
    ? t.x(`Messages — ${unread} unread`, `Ubutumwa — ${unread} butarasomwa`)
    : t.x('Messages — nothing unread', 'Ubutumwa — nta bushya');

  return (
    <button
      type="button"
      className="bell"
      onClick={() => { navigate('/beneficiary/messages'); refresh(); }}
      aria-label={label}
      title={label}
    >
      <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
      {unread > 0 && (
        <span className="bell-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>
      )}
    </button>
  );
}
