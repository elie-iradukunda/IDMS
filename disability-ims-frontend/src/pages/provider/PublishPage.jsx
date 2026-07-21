import { useAuth } from '../../context/AuthContext.jsx';
import PublishOpportunityForm from '../../components/PublishOpportunityForm.jsx';

export default function ProviderPublishPage() {
  const { user } = useAuth();
  return <PublishOpportunityForm org={user?.fullName || 'Inclusive Hands NGO'} />;
}
