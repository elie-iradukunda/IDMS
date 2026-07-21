import { useState } from 'react';
import { post, qs } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { SECTORS } from '../../lib/constants.js';
import { DISABILITY } from '../../lib/i18n.js';
import { Card, Badge, ImpairmentTags, Empty, Loading, ErrorState } from '../../components/ui.jsx';

// Least-privilege search: a provider can identify a candidate for
// assistance WITHOUT reading the full personal record — no name, no
// national ID, no daily challenges are returned by the API.
export default function ProviderSearchPage() {
  const { t, say } = useUI();
  const [impairmentType, setImpairmentType] = useState('all');
  const [sector, setSector] = useState('all');
  const [busyId, setBusyId] = useState(null);

  const search = useFetch(`/provider/search${qs({ impairmentType, sector })}`);
  const offers = useFetch('/provider/offers');

  const offeredIds = new Set((offers.data || []).filter((o) => o.status !== 'INELIGIBLE').map((o) => o.beneficiaryId));

  async function submitOffer(b) {
    setBusyId(b.id);
    try {
      const r = await post('/support/requests', { beneficiaryId: b.id, need: b.supportNeeds });
      say(t.x(`Offer ${r.code} submitted — the officer will review it`, `Igitekerezo ${r.code} cyatanzwe — umukozi arakireba`));
      offers.reload();
    } catch (e) {
      say(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="tabs" style={{ marginTop: 20 }}>
        <select
          className="input"
          style={{ maxWidth: 250 }}
          value={impairmentType}
          onChange={(e) => setImpairmentType(e.target.value)}
          aria-label="Filter by impairment"
        >
          <option value="all">{t.x('All impairments', 'Ubumuga bwose')}</option>
          {Object.keys(DISABILITY).map((k) => (
            <option key={k} value={k}>
              {t.d(k)}
            </option>
          ))}
        </select>
        <select
          className="input"
          style={{ maxWidth: 200 }}
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          aria-label="Filter by sector"
        >
          <option value="all">{t.x('All sectors', 'Imirenge yose')}</option>
          {SECTORS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {search.loading ? (
        <Loading />
      ) : search.error ? (
        <ErrorState error={search.error} onRetry={search.reload} />
      ) : search.data?.length ? (
        <div className="grid g2">
          {search.data.map((b) => (
            <Card key={b.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div className="card-t">
                  <span className="code">{b.code}</span>
                </div>
                <Badge tone="gray">{b.sector}</Badge>
              </div>
              <div style={{ marginTop: 8 }}>
                <ImpairmentTags list={b.impairments} />
              </div>
              <div className="rec">
                <div className="rl">{t.x('Recorded support need', 'Ubufasha bukenewe')}</div>
                {b.supportNeeds}
              </div>
              <small className="hint">
                🔒{' '}
                {t.x(
                  'Name, national ID and personal history are withheld — you can identify a candidate for assistance without reading their full record.',
                  "Izina n'indangamuntu birahishwe.",
                )}
              </small>
              <div className="row-actions">
                {offeredIds.has(b.id) ? (
                  <Badge tone="green">{t.x('Offer already submitted', 'Wamaze gutanga')}</Badge>
                ) : (
                  <button className="btn sm" disabled={busyId === b.id} onClick={() => submitOffer(b)}>
                    {t.x('Submit support offer', 'Tanga igitekerezo')}
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          title={t.x('No matching beneficiaries', 'Nta wabonetse')}
          sub={t.x('Try a different impairment or sector filter.', 'Hindura ishakisha.')}
        />
      )}
    </>
  );
}
