import { Outlet } from 'react-router-dom';
import { useUI } from '../../context/UIContext.jsx';

// Administrator workspace wrapper.
export default function AdminLayout() {
  const { t } = useUI();
  return (
    <div className="page">
      <h1 className="page-h">{t.x('System Administrator', 'Umuyobozi wa Sisitemu')} — NCPD / Kamonyi</h1>
      <div className="page-sub">
        {t.x(
          'Monitor coverage and distribution, manage users and role permissions, publish national announcements, and review the audit log.',
          'Kurikirana coverage, gucunga abakoresha, gutangaza, no gusuzuma audit log.',
        )}
      </div>
      <Outlet />
    </div>
  );
}
