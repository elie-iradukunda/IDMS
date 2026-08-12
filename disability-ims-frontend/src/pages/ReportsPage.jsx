import { useState } from 'react';
import { FileSpreadsheet, FileText, Eye, ShieldAlert } from 'lucide-react';
import { qs } from '../lib/api.js';
import { downloadFile } from '../lib/download.js';
import { useUI } from '../context/UIContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFetch } from '../lib/useFetch.js';
import { SECTORS, REQ_STATUSES } from '../lib/constants.js';
import { DISABILITY } from '../lib/i18n.js';
import { Card, Badge, Empty, Loading, ErrorState } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';

// Which filters each report understands. Offering a sector filter on a report
// that ignores it is a promise the export does not keep.
const FILTERS = {
  'officer-registry': ['sector', 'recordStatus'],
  'admin-registry': ['sector', 'recordStatus'],
  'officer-support': ['requestStatus'],
  'officer-corrections': ['correctionStatus'],
  'provider-needs': ['sector', 'impairment'],
  'admin-audit': ['q'],
};

// ─────────────────────────────────────────────────────────────
// Reports & exports.
//
// The numbers in this system end up in a monthly return, a council paper or a
// case file, and none of those live inside the app. Without an export the only
// route out is retyping from the screen, which is how a registry acquires a
// second, divergent copy of itself.
//
// Every role gets the reports it is entitled to and nothing else — the
// catalogue is filtered server-side by role, and each report re-derives its own
// scope from the signed-in user. A beneficiary's report is about them; a
// provider's shows beneficiaries by code only.
// ─────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { t, say } = useUI();
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch('/reports');
  const [filters, setFilters] = useState({});
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const list = data?.reports || [];
  const setFilter = (key, name) => (e) =>
    setFilters((f) => ({ ...f, [key]: { ...(f[key] || {}), [name]: e.target.value } }));

  // The report keys use their own filter names; map the UI's names onto them.
  const queryFor = (key) => {
    const f = filters[key] || {};
    return qs({
      sector: f.sector,
      status: f.recordStatus || f.requestStatus || f.correctionStatus,
      impairmentType: f.impairment,
      q: f.q,
    });
  };

  const grab = async (key, format) => {
    setBusy(`${key}:${format}`);
    try {
      const q = queryFor(key);
      const path = `/reports/${key}/download${q ? `${q}&` : '?'}format=${format}`;
      const name = await downloadFile(path, `IDS-${key}.${format}`);
      say(t.x(`Downloaded ${name}`, `Byakuwe: ${name}`));
    } catch (e) {
      say(e.message);
    } finally {
      setBusy('');
    }
  };

  const openPreview = async (report) => {
    setBusy(`${report.key}:preview`);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || '/api'}/reports/${report.key}/preview${queryFor(report.key)}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('ids_token')}` } },
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Preview failed');
      setPreview(await res.json());
    } catch (e) {
      say(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <Card style={{ marginTop: 22 }}>
        <div className="card-t">{t.x('Reports & exports', 'Raporo & gukuramo')}</div>
        <small className="hint">
          {t.x(
            'Every report is generated on the server as a formatted Excel workbook or a printable PDF carrying the system mark. You see only the reports your role is entitled to, and each one is scoped to what you may lawfully read.',
            "Buri raporo ikorwa kuri seriveri nka Excel cyangwa PDF ifite ikirango. Ubona gusa raporo uruhare rwawe rwemerewe.",
          )}
        </small>
        <div className="meta" style={{ marginTop: 10 }}>
          <Badge tone="sky">{t.x(`${list.length} report(s) available to you`, `Raporo ${list.length}`)}</Badge>
          <Badge tone="gray">{user?.role}</Badge>
        </div>
      </Card>

      {list.length ? (
        <div className="grid g2">
          {list.map((r) => {
            const fields = FILTERS[r.key] || [];
            return (
              <Card key={r.key}>
                <div className="card-t">{r.title}</div>
                <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.55, color: 'var(--muted)' }}>
                  {r.description}
                </div>

                {fields.length > 0 && (
                  <div className="form-grid" style={{ marginTop: 14 }}>
                    {fields.includes('sector') && (
                      <div>
                        <label className="field-label" htmlFor={`${r.key}-sector`}>{t.x('Sector', 'Umurenge')}</label>
                        <select id={`${r.key}-sector`} className="app-select"
                          value={filters[r.key]?.sector || 'all'} onChange={setFilter(r.key, 'sector')}>
                          <option value="all">{t.x('All sectors', 'Imirenge yose')}</option>
                          {SECTORS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    {fields.includes('recordStatus') && (
                      <div>
                        <label className="field-label" htmlFor={`${r.key}-rs`}>{t.x('Record status', 'Imimerere')}</label>
                        <select id={`${r.key}-rs`} className="app-select"
                          value={filters[r.key]?.recordStatus || 'all'} onChange={setFilter(r.key, 'recordStatus')}>
                          <option value="all">{t.x('All statuses', 'Byose')}</option>
                          <option value="ACTIVE">{t('ACTIVE')}</option>
                          <option value="ARCHIVED">{t('ARCHIVED')}</option>
                          <option value="DECEASED">{t('DECEASED')}</option>
                        </select>
                      </div>
                    )}
                    {fields.includes('requestStatus') && (
                      <div>
                        <label className="field-label" htmlFor={`${r.key}-qs`}>{t.x('Request status', 'Imimerere')}</label>
                        <select id={`${r.key}-qs`} className="app-select"
                          value={filters[r.key]?.requestStatus || 'all'} onChange={setFilter(r.key, 'requestStatus')}>
                          <option value="all">{t.x('All statuses', 'Byose')}</option>
                          {REQ_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
                        </select>
                      </div>
                    )}
                    {fields.includes('correctionStatus') && (
                      <div>
                        <label className="field-label" htmlFor={`${r.key}-cs`}>{t.x('Outcome', 'Icyemezo')}</label>
                        <select id={`${r.key}-cs`} className="app-select"
                          value={filters[r.key]?.correctionStatus || 'all'} onChange={setFilter(r.key, 'correctionStatus')}>
                          <option value="all">{t.x('All', 'Byose')}</option>
                          <option value="PENDING">{t.x('Awaiting review', 'Bitegereje')}</option>
                          <option value="APPLIED">{t.x('Applied', 'Byakosowe')}</option>
                          <option value="DECLINED">{t.x('Declined', 'Byanzwe')}</option>
                        </select>
                      </div>
                    )}
                    {fields.includes('impairment') && (
                      <div>
                        <label className="field-label" htmlFor={`${r.key}-imp`}>{t.x('Impairment', 'Ubumuga')}</label>
                        <select id={`${r.key}-imp`} className="app-select"
                          value={filters[r.key]?.impairment || 'all'} onChange={setFilter(r.key, 'impairment')}>
                          <option value="all">{t.x('All impairments', 'Bwose')}</option>
                          {Object.keys(DISABILITY).map((k) => <option key={k} value={k}>{t.d(k)}</option>)}
                        </select>
                      </div>
                    )}
                    {fields.includes('q') && (
                      <div className="full">
                        <label className="field-label" htmlFor={`${r.key}-q`}>{t.x('Search within the log', 'Shakisha')}</label>
                        <input id={`${r.key}-q`} className="app-input"
                          value={filters[r.key]?.q || ''} onChange={setFilter(r.key, 'q')}
                          placeholder={t.x('Action, person or record…', 'Igikorwa, umuntu…')} />
                      </div>
                    )}
                  </div>
                )}

                <div className="row-actions">
                  <button className="btn sm" disabled={!!busy} onClick={() => grab(r.key, 'xlsx')}>
                    <FileSpreadsheet className="h-[15px] w-[15px]" aria-hidden="true" />
                    {busy === `${r.key}:xlsx` ? t.x('Preparing…', 'Biratunganywa…') : t.x('Excel (.xlsx)', 'Excel (.xlsx)')}
                  </button>
                  <button className="btn ghost sm" disabled={!!busy} onClick={() => grab(r.key, 'pdf')}>
                    <FileText className="h-[15px] w-[15px]" aria-hidden="true" />
                    {busy === `${r.key}:pdf` ? t.x('Preparing…', 'Biratunganywa…') : t.x('PDF', 'PDF')}
                  </button>
                  <button className="btn ghost sm" disabled={!!busy} onClick={() => openPreview(r)}>
                    <Eye className="h-[15px] w-[15px]" aria-hidden="true" /> {t.x('Preview', 'Reba mbere')}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty title={t.x('No reports are available for your role', 'Nta raporo zihari')} />
      )}

      {preview && <PreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

// ── Preview ──
// A 4,000-row audit export is a slow thing to discover you did not want, so
// the shape of the report can be checked before committing to a download.
function PreviewDialog({ preview, onClose }) {
  const { t } = useUI();
  return (
    <Modal
      open onClose={onClose} size="lg"
      title={preview.title}
      subtitle={preview.subtitle || preview.description}
      footer={<button type="button" className="btn ghost sm" onClick={onClose}>{t.x('Close', 'Funga')}</button>}
    >
      {preview.summary?.length > 0 && (
        <div className="modal-current">
          <div className="rl">{t.x('At a glance', 'Muri make')}</div>
          {preview.summary.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
              <span style={{ color: 'var(--muted)' }}>{k}</span>
              <b>{String(v)}</b>
            </div>
          ))}
        </div>
      )}

      {preview.sheets.map((s) => (
        <div key={s.name} style={{ marginTop: 16 }}>
          <div className="card-t" style={{ fontSize: 15 }}>
            {s.name} <Badge tone={s.rowCount ? 'green' : 'gray'}>{t.x(`${s.rowCount} row(s)`, `Imirongo ${s.rowCount}`)}</Badge>
          </div>
          {s.sample.length ? (
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table>
                <caption className="sr-only">{s.name}</caption>
                <thead>
                  <tr>{s.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {s.sample.map((row, i) => (
                    <tr key={i}>{row.map((cell, j) => <td key={j} style={{ fontSize: 12.5 }}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {s.rowCount > s.sample.length && (
                <small className="hint">
                  {t.x(`Showing the first ${s.sample.length} of ${s.rowCount} rows — the export contains all of them.`,
                    `Hagaragara ${s.sample.length} muri ${s.rowCount} — iyo ukuyemo uzabona byose.`)}
                </small>
              )}
            </div>
          ) : (
            <small className="hint">{t.x('No rows match the current filters.', 'Nta mirongo ihuye.')}</small>
          )}
        </div>
      ))}

      <div className="warn" role="note" style={{ marginTop: 18, background: 'var(--brand-soft)', borderColor: 'var(--brand)', color: 'var(--brand-dark)' }}>
        <ShieldAlert className="h-[15px] w-[15px]" aria-hidden="true" style={{ display: 'inline', verticalAlign: -3, marginRight: 6 }} />
        {t.x(
          'The exported file carries personal data protected under Law No. 058/2021. Share it only with people entitled to see it, and delete copies you no longer need.',
          "Idosiye ikuwemo irimo amakuru y'ibanga arengerwa n'Itegeko 058/2021. Uyihe gusa ababyemerewe.",
        )}
      </div>
    </Modal>
  );
}
