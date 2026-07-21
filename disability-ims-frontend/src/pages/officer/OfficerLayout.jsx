import { Outlet } from 'react-router-dom';
import { useUI } from '../../context/UIContext.jsx';

// Officer workspace wrapper. Navigation is handled by the sidebar; this
// just frames the active page.
export default function OfficerLayout() {
  const { t } = useUI();
  return (
    <div className="page">
      <h1 className="page-h">
        {t.x('Local Officer', "Umukozi w'Akarere")} — Kamonyi District
      </h1>
      <div className="page-sub">
        {t.x(
          'Register beneficiaries, maintain the official record, coordinate support with a recorded reason for every decision, and publish opportunities.',
          'Andika abunguka, ubike inyandiko yemewe, uhuze ubufasha wandika impamvu, kandi utangaze amahirwe.',
        )}
      </div>
      <Outlet />
    </div>
  );
}
