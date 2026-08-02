import { useState, useRef } from 'react';
import { HandHeart } from 'lucide-react';
import { post, qs } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { SECTORS } from '../../lib/constants.js';
import { DISABILITY } from '../../lib/i18n.js';
import { Card, Badge, ImpairmentTags, Empty, Loading, ErrorState } from '../../components/ui.jsx';
import { FormModal } from '../../components/Modal.jsx';

// Least-privilege search: a provider can identify a candidate for
// assistance WITHOUT reading the full personal record — no name, no
// national ID, no daily challenges are returned by the API. This is what
// lets recorded need replace personal acquaintance as the basis of
// matching, which is the mechanism by which distribution becomes fairer.
export default function ProviderSearchPage() {
  const { t } = useUI();
  const [impairmentType, setImpairmentType] = useState('all');
  const [sector, setSector] = useState('all');
  const [target, setTarget] = useState(null);

  const search = useFetch(`/provider/search${qs({ impairmentType, sector })}`);
  const offers = useFetch('/provider/offers');

  const offered = new Set(
    (offers.data || [])
      .filter((o) => !['INELIGIBLE', 'CANCELLED'].includes(o.status))
      .map((o) => o.beneficiary?.code),
  );

  return (
    <>
      <div className="toolbar">
        <select className="app-select" style={{ maxWidth: 260 }} value={impairmentType}
          onChange={(e) => setImpairmentType(e.target.value)} aria-label={t.x('Filter by impairment', 'Ubumuga')}>
          <option value="all">{t.x('All impairments', 'Ubumuga bwose')}</option>
          {Object.keys(DISABILITY).map((k) => <option key={k} value={k}>{t.d(k)}</option>)}
        </select>
        <select className="app-select" style={{ maxWidth: 200 }} value={sector}
          onChange={(e) => setSector(e.target.value)} aria-label={t.x('Filter by sector', 'Umurenge')}>
          <option value="all">{t.x('All sectors', 'Imirenge yose')}</option>
          {SECTORS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {search.loading ? <Loading />
        : search.error ? <ErrorState error={search.error} onRetry={search.reload} />
        : search.data?.length ? (
          <>
            <p className="page-sub" style={{ marginTop: 14 }} role="status">
              {t.x(`${search.data.length} recorded need(s) match`, `Ubukene ${search.data.length} buhuye`)}
            </p>
            <div className="grid g2">
              {search.data.map((b) => (
                <Card key={b.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <div className="card-t"><span className="code">{b.code}</span></div>
                    <Badge tone="gray">{b.sector}</Badge>
                  </div>
                  <div style={{ marginTop: 8 }}><ImpairmentTags list={b.impairments} /></div>
                  <div className="rec">
                    <div className="rl">{t.x('Recorded support need', 'Ubufasha bukenewe')}</div>
                    {b.supportNeeds}
                  </div>
                  <small className="hint">
                    🔒 {t.x(
                      'Name, national ID and personal history are withheld — you can identify a candidate for assistance without reading their full record.',
                      "Izina n'indangamuntu n'amateka birahishwe.")}
                  </small>
                  <div className="row-actions">
                    {offered.has(b.code) ? (
                      <Badge tone="green">{t.x('Offer already submitted', 'Wamaze gutanga')}</Badge>
                    ) : (
                      <button className="btn sm" onClick={() => setTarget(b)}>
                        <HandHeart className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Submit support offer', 'Tanga igitekerezo')}
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <Empty
            title={t.x('No matching beneficiaries', 'Nta wabonetse')}
            sub={t.x('Try a different impairment or sector filter.', 'Hindura ishakisha.')}
          />
        )}

      {target && (
        <OfferDialog
          b={target}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); offers.reload(); search.reload(); }}
        />
      )}
    </>
  );
}

function OfferDialog({ b, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const [need, setNeed] = useState(b.supportNeeds || '');
  const m = useMutation();

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      title={t.x(`Offer support to ${b.code}`, `Tanga ubufasha kuri ${b.code}`)}
      subtitle={t.x('Your offer goes to the local officer, who decides on it with a recorded reason. You will see the outcome and the reason under "My offers".',
        "Igitekerezo cyawe kigera ku mukozi w'akarere, agafata icyemezo yandika impamvu. Uzabibona muri \"Ibyo natanze\".")}
      submitLabel={t.x('Submit offer', 'Ohereza')}
      onSubmit={() => {
        if (!need.trim()) return m.setError(t.x('Describe the support you are offering.', 'Sobanura ubufasha utanga.'));
        return m.run(() => post('/support/requests', { beneficiaryId: b.id, need: need.trim() }), {
          success: t.x('Offer submitted — the officer will review it', 'Cyatanzwe — umukozi arakireba'),
          then: onDone,
        });
      }}
    >
      <div className="modal-current">
        <div className="rl">{t.x('Recorded need', 'Ubukene bwanditse')}</div>
        {b.supportNeeds}
        <div className="rl" style={{ marginTop: 10 }}>{t.x('Sector', 'Umurenge')}</div>
        {b.sector}
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="field-label" htmlFor="of-need">{t.x('Support you are offering', 'Ubufasha utanga')} *</label>
        <textarea ref={first} id="of-need" className="app-input" style={{ minHeight: 90 }}
          value={need} onChange={(e) => setNeed(e.target.value)} />
        <small className="hint">
          {t.x('Prefilled from the recorded need. Edit it if what you can provide differs.',
            'Byuzuye bivuye ku bukene bwanditse. Hindura niba ibyo ushobora gutanga bitandukanye.')}
        </small>
      </div>
    </FormModal>
  );
}
