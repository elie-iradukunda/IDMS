import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { roleHome } from '../lib/constants.js';

// A bookmarked or mistyped address used to bounce the user silently to their
// dashboard, which reads as the link having worked and simply gone somewhere
// unexpected. Saying the page does not exist, and offering the way back, is
// the difference between a dead end and a wrong turn.
export default function NotFoundPage() {
  const { t } = useUI();
  const { user } = useAuth();
  const home = user ? roleHome(user.role) : '/login';

  return (
    <div style={{ maxWidth: 560, margin: '12vh auto', padding: 24 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40 }} aria-hidden="true">🧭</div>
        <h1 className="card-t" style={{ marginTop: 8, fontSize: 20 }}>
          {t.x('This page does not exist', 'Uru rupapuro ntiruhari')}
        </h1>
        <p className="page-sub" style={{ margin: '8px auto 0' }}>
          {t.x(
            'The address may have been mistyped, or the page may have been moved since it was bookmarked.',
            'Aderesi ishobora kuba yanditse nabi, cyangwa urupapuro rwarahindutse.',
          )}
        </p>
        <div className="row-actions" style={{ justifyContent: 'center' }}>
          <Link className="btn" to={home} style={{ textDecoration: 'none' }}>
            {user
              ? t.x('Go to my dashboard', 'Subira ku ibaruwa yanjye')
              : t.x('Go to sign in', 'Jya ku kwinjira')}
          </Link>
        </div>
      </div>
    </div>
  );
}
