import { useState } from 'react';
import { qs } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { SECTORS } from '../../lib/constants.js';
import { Card, Badge, ImpairmentTags, Empty, Loading, ErrorState } from '../../components/ui.jsx';

// Registry oversight. The administrator's mandate is to monitor coverage
// and distribution, which cannot be done without seeing the records — but
// the authority to change an official record stays with the verifying
// officer, so this view is deliberately read-only. Separating who can see
// from who can change is what keeps the audit trail meaningful.
export default function AdminRegistryPage() {
  const { t } = useUI();
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('all');
  const [status, setStatus] = useState('all');
  const { data, loading, error, reload } = useFetch(`/admin/registry${qs({ q, sector, status })}`);

  return (
    <>
      <div className="toolbar">
        <div className="grow">
          <label htmlFor="aq" className="sr-only">{t.x('Search registry', 'Shakisha')}</label>
          <input id="aq" className="input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t.x('Search by name, code, village or need…', 'Shakisha izina, code, umudugudu…')} />
        </div>
        <select className="app-select" style={{ maxWidth: 190 }} value={sector}
          onChange={(e) => setSector(e.target.value)} aria-label={t.x('Filter by sector', 'Umurenge')}>
          <option value="all">{t.x('All sectors', 'Imirenge yose')}</option>
          {SECTORS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="app-select" style={{ maxWidth: 190 }} value={status}
          onChange={(e) => setStatus(e.target.value)} aria-label={t.x('Filter by record status', 'Imimerere')}>
          <option value="all">{t.x('All statuses', 'Byose')}</option>
          <option value="ACTIVE">{t('ACTIVE')}</option>
          <option value="ARCHIVED">{t('ARCHIVED')}</option>
          <option value="DECEASED">{t('DECEASED')}</option>
        </select>
      </div>

      <Card style={{ marginTop: 16 }}>
        <div className="card-t">{t.x('Registry oversight', 'Kugenzura registry')}</div>
        <small className="hint">
          🔒 {t.x(
            'Read-only. Administrators monitor coverage and distribution; the authority to change an official record stays with the verifying officer, and every change they make is attributable in the audit log.',
            "Ni ukureba gusa. Umuyobozi agenzura, ariko umukozi ni we uhindura inyandiko yemewe.")}
        </small>

        {loading ? <Loading />
          : error ? <ErrorState error={error} onRetry={reload} />
          : data?.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <caption className="sr-only">{t.x('All beneficiary records', 'Inyandiko zose')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.x('Code', 'Code')}</th>
                    <th scope="col">{t.x('Name', 'Amazina')}</th>
                    <th scope="col">{t.x('Location', 'Aho aba')}</th>
                    <th scope="col">{t.x('Impairments', 'Ubumuga')}</th>
                    <th scope="col">{t.x('Access', 'Uko yinjira')}</th>
                    <th scope="col">{t.x('Status', 'Imimerere')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((b) => (
                    <tr key={b.id}>
                      <td><span className="code">{b.code}</span></td>
                      <td style={{ fontWeight: 600 }}>{b.fullName}</td>
                      <td style={{ fontSize: 13, color: 'var(--muted)' }}>
                        {[b.sector, b.cell, b.village].filter(Boolean).join(' · ')}
                      </td>
                      <td><ImpairmentTags list={b.impairments} /></td>
                      <td style={{ fontSize: 13, color: 'var(--muted)' }}>
                        {b.email
                          ? t.x('Direct login', 'Yinjira ubwe')
                          : t.x('Guardian/officer-mediated', "Binyuze ku murezi/umukozi")}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <Badge tone={b.status === 'ACTIVE' ? 'green' : b.status === 'DECEASED' ? 'violet' : 'gray'}>
                            {t(b.status)}
                          </Badge>
                          {!b.verified && <Badge tone="amber">{t.x('Unverified', 'Bitemejwe')}</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title={t.x('No matching records', 'Nta cyabonetse')} />}
      </Card>
    </>
  );
}
