import { useUI } from '../../context/UIContext.jsx';
import PublishOpportunityForm from '../../components/PublishOpportunityForm.jsx';

export default function AnnouncementPage() {
  const { t } = useUI();
  return (
    <PublishOpportunityForm
      org="NCPD"
      heading={t.x('Publish a national announcement', 'Tangaza itangazo rusange')}
      blurb={t.x(
        'National opportunities and announcements published here reach every registered beneficiary directly, in-app and by email where an address is on file.',
        'Amahirwe rusange atangazwa aha ageza ku bunganirwa bose, muri sisitemu no kuri imeyili aho ihari.',
      )}
    />
  );
}
