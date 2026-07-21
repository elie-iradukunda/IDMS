import { useState } from 'react';
import { patch, post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Card, Badge, ImpairmentTags, Empty, Loading, ErrorState } from '../../components/ui.jsx';

// The centralised registry. Officers search, update the official record,
// and initiate support requests directly (a request-driven system only
// serves those able to make a request).
export default function RegistryPage() {
  const { t } = useUI();
  const { data, loading, error, reload } = useFetch('/registry');
  const [q, setQ] = useState('');

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const term = q.toLowerCase();
  const rows = (data || []).filter((b) =>
    [b.fullName, b.code, b.sector, b.supportNeeds].filter(Boolean).join(' ').toLowerCase().includes(term),
  );

  return (
    <>
      <div style={{ marginTop: 20 }}>
        <label htmlFor="sq" className="sr-only">
          {t.x('Search registry', 'Shakisha')}
        </label>
        <input
          id="sq"
          className="input"
          placeholder={t.x('Search by name, code, sector or need…', 'Shakisha izina, code, umurenge…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {rows.length ? (
        <div className="grid g2">
          {rows.map((b) => (
            <BenCard key={b.id} b={b} reload={reload} />
          ))}
        </div>
      ) : (
        <Empty
          title={t.x('No matching records', 'Nta cyabonetse')}
          sub={t.x('Try a different search term.', 'Gerageza andi magambo.')}
        />
      )}
    </>
  );
}

function BenCard({ b, reload }) {
  const { t, say } = useUI();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ supportNeeds: b.supportNeeds || '', village: b.village || '', status: b.status || 'ACTIVE' });
  const [busy, setBusy] = useState(false);

  async function setStatus(status) {
    setBusy(true);
    try {
      await post(`/registry/${b.id}/status`, { status });
      say(t.x(`Record ${b.code} → ${status.toLowerCase()}`, `Inyandiko ${b.code} → ${status.toLowerCase()}`));
      reload();
    } catch (e) { say(e.message); } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true);
    try {
      await patch(`/registry/${b.id}`, f);
      say(t.x(`Record ${b.code} updated`, `Inyandiko ${b.code} yavuguruwe`));
      setEdit(false);
      reload();
    } catch (e) {
      say(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function createRequest() {
    setBusy(true);
    try {
      const r = await post('/support/requests', { beneficiaryId: b.id, need: b.supportNeeds });
      say(t.x(`Support request ${r.code} created`, `Icyifuzo ${r.code} cyakozwe`));
    } catch (e) {
      say(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div className="card-t">
          {b.fullName} <span className="code">{b.code}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {b.status && b.status !== 'ACTIVE' && <Badge tone="gray">{t(b.status)}</Badge>}
          <Badge tone={b.verified ? 'green' : 'amber'}>
            {b.verified ? t.x('Verified', 'Byemejwe') : t.x('Unverified', 'Bitemejwe')}
          </Badge>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <ImpairmentTags list={b.impairments} />
      </div>
      <div className="rec">
        <div className="rl">{t.x('Location', 'Aho aba')}</div>
        {edit ? (
          <input
            className="input"
            style={{ marginTop: 4 }}
            value={f.village}
            onChange={(e) => setF({ ...f, village: e.target.value })}
          />
        ) : (
          <span className="rr">
            {b.sector} · {b.cell} · {b.village}
          </span>
        )}
        <div className="rl">{t.x('Daily challenges', 'Ingorane za buri munsi')}</div>
        <span className="rr">{b.dailyChallenges || '—'}</span>
        <div className="rl">{t.x('Support needs', 'Ubufasha akeneye')}</div>
        {edit ? (
          <textarea
            className="input"
            style={{ marginTop: 4 }}
            value={f.supportNeeds}
            onChange={(e) => setF({ ...f, supportNeeds: e.target.value })}
          />
        ) : (
          <span className="rr">{b.supportNeeds}</span>
        )}
        <div className="rl">{t.x('Guardian', 'Umurezi')}</div>
        <span className="rr">{b.guardianName || '—'}</span>
        <div className="rl">{t.x('Account', 'Konti')}</div>
        <span className="rr">
          {b.email
            ? `✉️ ${b.email}`
            : t.x('No email — guardian/officer-mediated access', 'Nta imeyili — binyuze ku murezi/umukozi')}
        </span>
      </div>
      {edit && (
        <div style={{ marginTop: 12 }}>
          <label className="field-label">{t.x('Record status', "Imimerere y'inyandiko")}</label>
          <select className="app-select" style={{ maxWidth: 240 }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="ACTIVE">{t('ACTIVE')}</option>
            <option value="ARCHIVED">{t('ARCHIVED')}</option>
            <option value="DECEASED">{t('DECEASED')}</option>
          </select>
        </div>
      )}
      <div className="row-actions">
        {edit ? (
          <>
            <button className="btn green sm" onClick={save} disabled={busy}>
              {t('save')}
            </button>
            <button
              className="btn ghost sm"
              onClick={() => {
                setF({ supportNeeds: b.supportNeeds || '', village: b.village || '', status: b.status || 'ACTIVE' });
                setEdit(false);
              }}
            >
              {t('cancel')}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost sm" onClick={() => setEdit(true)}>
              {t.x('Update record', 'Vugurura')}
            </button>
            <button className="btn sm" onClick={createRequest} disabled={busy || b.status !== 'ACTIVE'}>
              {t.x('Create support request', 'Saba ubufasha')}
            </button>
            {b.status === 'ACTIVE' ? (
              <button className="btn red sm" onClick={() => setStatus('ARCHIVED')} disabled={busy}>
                {t.x('Archive', 'Bika')}
              </button>
            ) : (
              <button className="btn ghost sm" onClick={() => setStatus('ACTIVE')} disabled={busy}>
                {t.x('Restore', 'Garura')}
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
