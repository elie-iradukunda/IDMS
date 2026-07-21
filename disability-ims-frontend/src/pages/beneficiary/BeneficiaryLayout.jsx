import { Outlet } from 'react-router-dom';
import { useUI } from '../../context/UIContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { shortName } from '../../lib/format.js';

// Beneficiary workspace wrapper. The record is the SAME data the officer
// sees, under a read-only permission.
export default function BeneficiaryLayout() {
  const { t } = useUI();
  const { user } = useAuth();
  return (
    <div className="page">
      <h1 className="page-h">
        {t.x('Welcome', 'Murakaza neza')}, {shortName(user?.fullName)} 👋
      </h1>
      <div className="page-sub">
        {t.x(
          'This is your verified record. It is read-only — if something is wrong you can request a correction, and your officer will review it.',
          'Uyu ni umwirondoro wawe wemejwe. Ni uwo kureba gusa — niba hari ikitari cyo, saba ko gikosorwa.',
        )}
      </div>
      <Outlet />
    </div>
  );
}
