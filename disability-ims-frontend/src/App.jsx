import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { roleHome } from './lib/constants.js';
import { Loading } from './components/ui.jsx';
import DashboardLayout from './components/DashboardLayout.jsx';

import LoginPage from './pages/LoginPage.jsx';

import OfficerLayout from './pages/officer/OfficerLayout.jsx';
import RegistryPage from './pages/officer/RegistryPage.jsx';
import RegisterBeneficiaryPage from './pages/officer/RegisterBeneficiaryPage.jsx';
import SupportRequestsPage from './pages/officer/SupportRequestsPage.jsx';
import CorrectionsPage from './pages/officer/CorrectionsPage.jsx';
import OfficerPublishPage from './pages/officer/PublishPage.jsx';

import BeneficiaryLayout from './pages/beneficiary/BeneficiaryLayout.jsx';
import MyProfilePage from './pages/beneficiary/MyProfilePage.jsx';
import MySupportPage from './pages/beneficiary/MySupportPage.jsx';
import OpportunitiesPage from './pages/beneficiary/OpportunitiesPage.jsx';
import MessagesPage from './pages/beneficiary/MessagesPage.jsx';

import ProviderLayout from './pages/provider/ProviderLayout.jsx';
import ProviderSearchPage from './pages/provider/ProviderSearchPage.jsx';
import ProviderOffersPage from './pages/provider/ProviderOffersPage.jsx';
import ProviderPublishPage from './pages/provider/PublishPage.jsx';

import AdminLayout from './pages/admin/AdminLayout.jsx';
import ReportsPage from './pages/admin/ReportsPage.jsx';
import UsersPage from './pages/admin/UsersPage.jsx';
import AuditPage from './pages/admin/AuditPage.jsx';
import AnnouncementPage from './pages/admin/AnnouncementPage.jsx';

// Sends the user to their own dashboard (or the login screen).
function HomeRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return <Navigate to={user ? roleHome(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Local Officer */}
      <Route path="/officer" element={<DashboardLayout role="OFFICER" />}>
        <Route index element={<Navigate to="registry" replace />} />
        <Route element={<OfficerLayout />}>
          <Route path="registry" element={<RegistryPage />} />
          <Route path="register" element={<RegisterBeneficiaryPage />} />
          <Route path="requests" element={<SupportRequestsPage />} />
          <Route path="corrections" element={<CorrectionsPage />} />
          <Route path="publish" element={<OfficerPublishPage />} />
        </Route>
      </Route>

      {/* Beneficiary / Guardian */}
      <Route path="/beneficiary" element={<DashboardLayout role="BENEFICIARY" />}>
        <Route index element={<Navigate to="profile" replace />} />
        <Route element={<BeneficiaryLayout />}>
          <Route path="profile" element={<MyProfilePage />} />
          <Route path="support" element={<MySupportPage />} />
          <Route path="opportunities" element={<OpportunitiesPage />} />
          <Route path="messages" element={<MessagesPage />} />
        </Route>
      </Route>

      {/* Support Provider */}
      <Route path="/provider" element={<DashboardLayout role="PROVIDER" />}>
        <Route index element={<Navigate to="search" replace />} />
        <Route element={<ProviderLayout />}>
          <Route path="search" element={<ProviderSearchPage />} />
          <Route path="offers" element={<ProviderOffersPage />} />
          <Route path="publish" element={<ProviderPublishPage />} />
        </Route>
      </Route>

      {/* Administrator */}
      <Route path="/admin" element={<DashboardLayout role="ADMIN" />}>
        <Route index element={<Navigate to="reports" replace />} />
        <Route element={<AdminLayout />}>
          <Route path="reports" element={<ReportsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="announcement" element={<AnnouncementPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
      </Route>

      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
