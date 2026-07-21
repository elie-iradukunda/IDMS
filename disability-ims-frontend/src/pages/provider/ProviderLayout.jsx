import { Outlet } from 'react-router-dom';
import { useUI } from '../../context/UIContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

// Provider workspace wrapper. Matching rests on recorded need rather than
// on acquaintance.
export default function ProviderLayout() {
  const { t } = useUI();
  const { user } = useAuth();
  return (
    <div className="page">
      <h1 className="page-h">
        {t.x('Support Provider', 'Utanga Ubufasha')} — {user?.fullName}
      </h1>
      <div className="page-sub">
        {t.x(
          'Search the registry by recorded need and offer targeted support. Matching rests on recorded need rather than on acquaintance — which is how support reaches those who need it most, not those best known.',
          'Shakisha ukurikije ubukene bwanditse utange ubufasha.',
        )}
      </div>
      <Outlet />
    </div>
  );
}
