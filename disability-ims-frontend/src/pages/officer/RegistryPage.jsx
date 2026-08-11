import { useState, useRef, useMemo, useEffect } from 'react';
import { Trash2, HandHeart, Pencil, Archive, RotateCcw, Download } from 'lucide-react';
import { patch, post, del, qs } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useFetch, usePagedFetch } from '../../lib/useFetch.js';
import { useMutation } from '../../lib/useMutation.js';
import { useDebounced } from '../../lib/useDebounced.js';
import { registryColumns } from '../../lib/registryColumns.js';
import { downloadCsv, stamped } from '../../lib/csv.js';
import { SECTORS } from '../../lib/constants.js';
import { DISABILITY, DIFFICULTY } from '../../lib/i18n.js';
import { Card, Badge, ImpairmentTags, Empty, Loading, ErrorState, Pager } from '../../components/ui.jsx';
import { FormModal } from '../../components/Modal.jsx';

const PAGE_SIZE = 24;

// The centralised registry. Officers search, update the official record,
// maintain the impairment list, and initiate support requests directly —
// a request-driven system only serves those able to make a request.
export default function RegistryPage() {
  const { t } = useUI();
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState(null);   // { kind, b }

  // Debounced so typing a name is one query rather than one per keystroke —
  // on a shared rural connection the answers otherwise arrive out of order
  // and the list flickers between results.
  const term = useDebounced(q, 350);

  // Filtering and paging both run on the server so the officer is not
  // searching one page of results while the rest of the district sits
  // unqueried, and the browser is not asked to hold 2,400 records at once.
  const { data, total, loading, error, reload } =
    usePagedFetch(`/registry${qs({ q: term, sector, status, limit: PAGE_SIZE, offset: page * PAGE_SIZE })}`);

  // Any change to the query starts again at the first page; staying on page 7
  // of the previous result set shows an empty list and reads as "no matches".
  useEffect(() => { setPage(0); }, [term, sector, status]);

  const close = () => setDialog(null);
  const done = () => { close(); reload(); };

  const exportCsv = () =>
    downloadCsv(stamped('registry'), registryColumns({ t, includeNationalId: true }), data || []);

  return (
    <>
      <div className="toolbar">
        <div className="grow">
          <label htmlFor="sq" className="sr-only">{t.x('Search registry', 'Shakisha')}</label>
          <input
            id="sq" className="input"
            placeholder={t.x('Search by name, code, ID, village or need…', 'Shakisha izina, code, indangamuntu…')}
            value={q} onChange={(e) => setQ(e.target.value)}
          />
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
        <button className="btn ghost sm" onClick={exportCsv} disabled={!data?.length}>
          <Download className="h-[15px] w-[15px]" aria-hidden="true" />
          {t.x('Export page (CSV)', 'Kuramo (CSV)')}
        </button>
      </div>

      {loading ? <Loading />
        : error ? <ErrorState error={error} onRetry={reload} />
        : data?.length ? (
          <>
            <p className="page-sub" style={{ marginTop: 14 }} role="status">
              {total > data.length
                ? t.x(`${total} record(s) match — showing ${data.length}`, `Inyandiko ${total} zihuye — hagaragara ${data.length}`)
                : t.x(`${total} record(s)`, `Inyandiko ${total}`)}
            </p>
            <div className="grid g2">
              {data.map((b) => <BenCard key={b.id} b={b} onAction={(kind) => setDialog({ kind, b })} />)}
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} total={total} count={data.length} onPage={setPage} />
          </>
        ) : (
          <Empty
            title={t.x('No matching records', 'Nta cyabonetse')}
            sub={t.x('Try a different search term or clear the filters.', 'Gerageza andi magambo cyangwa ukureho amashakiro.')}
          />
        )}

      {dialog?.kind === 'edit' && <EditRecordDialog b={dialog.b} onClose={close} onDone={done} />}
      {dialog?.kind === 'impairments' && <ImpairmentsDialog b={dialog.b} onClose={close} onDone={reload} />}
      {dialog?.kind === 'request' && <CreateRequestDialog b={dialog.b} onClose={close} onDone={done} />}
      {dialog?.kind === 'status' && <StatusDialog b={dialog.b} onClose={close} onDone={done} />}
    </>
  );
}

function BenCard({ b, onAction }) {
  const { t } = useUI();
  const inactive = b.status !== 'ACTIVE';
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div className="card-t">
          {b.fullName} <span className="code">{b.code}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {inactive && <Badge tone={b.status === 'DECEASED' ? 'violet' : 'gray'}>{t(b.status)}</Badge>}
          <Badge tone={b.verified ? 'green' : 'amber'}>
            {b.verified ? t.x('Verified', 'Byemejwe') : t.x('Unverified', 'Bitemejwe')}
          </Badge>
        </div>
      </div>

      <div style={{ marginTop: 8 }}><ImpairmentTags list={b.impairments} /></div>

      <div className="rec">
        <div className="rl">{t.x('Location', 'Aho aba')}</div>
        <span className="rr">{[b.sector, b.cell, b.village].filter(Boolean).join(' · ')}</span>
        <div className="rl">{t.x('Daily challenges', 'Ingorane za buri munsi')}</div>
        <span className="rr">{b.dailyChallenges || '—'}</span>
        <div className="rl">{t.x('Support needs', 'Ubufasha akeneye')}</div>
        <span className="rr">{b.supportNeeds}</span>
        <div className="rl">{t.x('Guardian', 'Umurezi')}</div>
        <span className="rr">{b.guardianName || '—'}</span>
        <div className="rl">{t.x('Account', 'Konti')}</div>
        <span className="rr">
          {b.email
            ? `✉️ ${b.email}`
            : t.x('No email — guardian/officer-mediated access', 'Nta imeyili — binyuze ku murezi/umukozi')}
        </span>
      </div>

      <div className="row-actions">
        <button className="btn ghost sm" onClick={() => onAction('edit')}>
          <Pencil className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Edit record', 'Vugurura')}
        </button>
        <button className="btn ghost sm" onClick={() => onAction('impairments')}>
          {t.x('Impairments', 'Ubumuga')} ({b.impairments?.length || 0})
        </button>
        <button className="btn sm" onClick={() => onAction('request')} disabled={inactive}>
          <HandHeart className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Request support', 'Saba ubufasha')}
        </button>
        <button className={`btn sm ${inactive ? 'ghost' : 'red'}`} onClick={() => onAction('status')}>
          {inactive
            ? <><RotateCcw className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Change status', 'Hindura')}</>
            : <><Archive className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Archive', 'Bika')}</>}
        </button>
      </div>
    </Card>
  );
}

// ── Edit the official record ─────────────────────────────────
function EditRecordDialog({ b, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const [f, setF] = useState({
    fullName: b.fullName || '', nationalId: b.nationalId || '', sector: b.sector || '',
    cell: b.cell || '', village: b.village || '', guardianName: b.guardianName || '',
    email: b.email || '', dailyChallenges: b.dailyChallenges || '',
    supportNeeds: b.supportNeeds || '', verified: !!b.verified,
  });
  const m = useMutation();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = () => {
    if (!f.fullName.trim()) return m.setError(t.x('Full name is required.', 'Amazina arakenewe.'));
    if (!f.supportNeeds.trim()) {
      return m.setError(t.x('Support needs are required — a disability category alone cannot say what a person needs.',
        'Ubufasha akeneye burakenewe.'));
    }
    return m.run(() => patch(`/registry/${b.id}`, f), {
      success: t.x(`Record ${b.code} updated`, `Inyandiko ${b.code} yavuguruwe`),
      then: onDone,
    });
  };

  return (
    <FormModal
      open onClose={onClose} size="lg" onSubmit={submit} busy={m.busy} error={m.error}
      initialFocus={first}
      title={t.x(`Edit record ${b.code}`, `Vugurura ${b.code}`)}
      subtitle={t.x('Every change is written to the audit log with your name, the previous value and the new one, and the beneficiary is notified that their record changed.',
        "Buri mpinduka yandikwa muri audit log hamwe n'izina ryawe. Uwunguka aramenyeshwa.")}
      submitLabel={t.x('Save changes', 'Bika impinduka')}
    >
      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="e-name">{t.x('Full name', 'Amazina')} *</label>
          <input ref={first} id="e-name" className="app-input" value={f.fullName} onChange={set('fullName')} />
        </div>
        <div>
          <label className="field-label" htmlFor="e-nid">{t.x('National ID', 'Indangamuntu')}</label>
          <input id="e-nid" className="app-input" value={f.nationalId} onChange={set('nationalId')} />
        </div>
        <div>
          <label className="field-label" htmlFor="e-sector">{t.x('Sector', 'Umurenge')} *</label>
          <select id="e-sector" className="app-select" value={f.sector} onChange={set('sector')}>
            {!SECTORS.includes(f.sector) && f.sector && <option>{f.sector}</option>}
            {SECTORS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="e-cell">{t.x('Cell', 'Akagari')}</label>
          <input id="e-cell" className="app-input" value={f.cell} onChange={set('cell')} />
        </div>
        <div>
          <label className="field-label" htmlFor="e-village">{t.x('Village', 'Umudugudu')}</label>
          <input id="e-village" className="app-input" value={f.village} onChange={set('village')} />
        </div>
        <div>
          <label className="field-label" htmlFor="e-guardian">{t.x('Guardian', 'Umurezi')}</label>
          <input id="e-guardian" className="app-input" value={f.guardianName} onChange={set('guardianName')} />
        </div>
        <div className="full">
          <label className="field-label" htmlFor="e-email">{t.x('Email (login account)', 'Imeyili (konti)')}</label>
          <input id="e-email" type="email" className="app-input" value={f.email} onChange={set('email')} />
          <small className="hint">
            {t.x("Changing this also moves the beneficiary's login. Leave it empty where access is guardian- or officer-mediated.",
              "Guhindura ibi bihindura n'aho yinjirira. Reka ubusa iyo abifashwamo n'umurezi.")}
          </small>
        </div>
        <div className="full">
          <label className="field-label" htmlFor="e-daily">{t.x('Daily challenges', 'Ingorane za buri munsi')}</label>
          <textarea id="e-daily" className="app-input" style={{ minHeight: 74 }} value={f.dailyChallenges} onChange={set('dailyChallenges')} />
        </div>
        <div className="full">
          <label className="field-label" htmlFor="e-needs">{t.x('Support needs', 'Ubufasha akeneye')} *</label>
          <textarea id="e-needs" className="app-input" style={{ minHeight: 74 }} value={f.supportNeeds} onChange={set('supportNeeds')} />
        </div>
      </div>

      <label className="consent" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} />
        <span>
          <b>{t.x('Record verified', 'Byemejwe')}</b><br />
          {t.x('Confirms an officer has checked this record against the person it describes. Only verified, active records appear in provider search.',
            'Byemeza ko umukozi yagenzuye iyi nyandiko.')}
        </span>
      </label>
    </FormModal>
  );
}

// ── Maintain the impairment list ─────────────────────────────
function ImpairmentsDialog({ b, onClose, onDone }) {
  const { t } = useUI();
  const { data, loading, reload } = useFetch(`/registry/${b.id}`);
  const m = useMutation({ onDone: () => { reload(); onDone(); } });
  const [add, setAdd] = useState({ type: '', level: 'some' });

  const list = data?.impairments || [];
  const used = new Set(list.map((i) => i.type));
  const available = Object.keys(DISABILITY).filter((k) => !used.has(k));

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error}
      onSubmit={() => {
        if (!add.type) return m.setError(t.x('Choose an impairment type to add.', 'Hitamo ubwoko.'));
        return m.run(() => post(`/registry/${b.id}/impairments`, add), {
          success: t.x('Impairment added', 'Byongewemo'),
          then: () => setAdd({ type: '', level: 'some' }),
        });
      }}
      title={t.x(`Impairments — ${b.code}`, `Ubumuga — ${b.code}`)}
      subtitle={t.x('The type of functional difficulty and its severity. A record must keep at least one, and the same type cannot be recorded twice.',
        "Ubwoko bw'ingorane n'urugero rwabwo. Inyandiko igomba kugumana nibura bumwe.")}
      submitLabel={t.x('Add impairment', 'Ongeraho')}
    >
      {loading ? <Loading /> : (
        <>
          <div className="modal-current" style={{ padding: '4px 13px' }}>
            {list.map((im) => (
              <div key={im.id} className="imp-row">
                <div className="grow" style={{ fontWeight: 600, fontSize: 14 }}>{t.d(im.type)}</div>
                <select
                  className="app-select" style={{ maxWidth: 190, padding: '7px 10px' }}
                  value={im.level} disabled={m.busy}
                  aria-label={t.x(`Difficulty level for ${t.d(im.type)}`, `Urugero rw'ingorane: ${t.d(im.type)}`)}
                  onChange={(e) => m.run(() => patch(`/impairments/${im.id}`, { level: e.target.value }), {
                    success: t.x('Difficulty updated', 'Byahinduwe'),
                  })}
                >
                  {Object.keys(DIFFICULTY).map((k) => <option key={k} value={k}>{t.diff(k)}</option>)}
                </select>
                <button
                  type="button" className="btn red sm" disabled={m.busy || list.length <= 1}
                  title={list.length <= 1 ? t.x('A record must keep at least one impairment', 'Igomba kugumana nibura bumwe') : ''}
                  aria-label={t.x(`Remove ${t.d(im.type)}`, `Kuraho ${t.d(im.type)}`)}
                  onClick={() => m.run(() => del(`/impairments/${im.id}`), { success: t.x('Impairment removed', 'Byakuweho') })}
                >
                  <Trash2 className="h-[14px] w-[14px]" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          {available.length ? (
            <div className="form-grid" style={{ marginTop: 16 }}>
              <div>
                <label className="field-label" htmlFor="ai-type">{t.x('Add impairment type', 'Ongeraho ubwoko')}</label>
                <select id="ai-type" className="app-select" value={add.type} onChange={(e) => setAdd({ ...add, type: e.target.value })}>
                  <option value="">{t.x('Select…', 'Hitamo…')}</option>
                  {available.map((k) => <option key={k} value={k}>{t.d(k)}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="ai-level">{t.x('Difficulty', 'Urugero')}</label>
                <select id="ai-level" className="app-select" value={add.level} onChange={(e) => setAdd({ ...add, level: e.target.value })}>
                  {Object.keys(DIFFICULTY).map((k) => <option key={k} value={k}>{t.diff(k)}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <small className="hint" style={{ display: 'block', marginTop: 14 }}>
              {t.x('Every impairment type is already recorded for this beneficiary.', 'Ubwoko bwose bwamaze kwandikwa.')}
            </small>
          )}
        </>
      )}
    </FormModal>
  );
}

// ── Officer-initiated support request ────────────────────────
function CreateRequestDialog({ b, onClose, onDone }) {
  const { t } = useUI();
  const first = useRef(null);
  const [need, setNeed] = useState(b.supportNeeds || '');
  const m = useMutation();

  return (
    <FormModal
      open onClose={onClose} size="md" busy={m.busy} error={m.error} initialFocus={first}
      onSubmit={() => {
        if (!need.trim()) return m.setError(t.x('Describe the support being requested.', 'Sobanura ubufasha busabwa.'));
        return m.run(() => post('/support/requests', { beneficiaryId: b.id, need: need.trim() }), {
          success: t.x('Support request created', 'Icyifuzo cyakozwe'),
          then: onDone,
        });
      }}
      title={t.x(`Request support for ${b.fullName}`, `Saba ubufasha kuri ${b.fullName}`)}
      subtitle={t.x('Officer-initiated requests exist because a request-driven system serves only those able to make a request — and the person least able to ask is frequently the person who most needs it.',
        'Umukozi ashobora gusaba ku wutabashije gusaba ubwe.')}
      submitLabel={t.x('Create request', 'Kora icyifuzo')}
    >
      <div className="modal-current">
        <div className="rl">{t.x('Recorded support need', 'Ubufasha bwanditse')}</div>
        {b.supportNeeds}
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="field-label" htmlFor="cr-need">{t.x('Support being requested', 'Ubufasha busabwa')} *</label>
        <textarea ref={first} id="cr-need" className="app-input" style={{ minHeight: 80 }}
          value={need} onChange={(e) => setNeed(e.target.value)} />
        <small className="hint">
          {t.x('Prefilled from the record. Edit it if this particular request is narrower or different.',
            'Byuzuye bivuye ku nyandiko. Hindura niba iki cyifuzo gitandukanye.')}
        </small>
      </div>
    </FormModal>
  );
}

// ── Lifecycle: archive / restore / deceased ──────────────────
function StatusDialog({ b, onClose, onDone }) {
  const { t } = useUI();
  const [status, setStatus] = useState(b.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE');
  const m = useMutation();

  const help = useMemo(() => ({
    ACTIVE: t.x('In active coordination: appears in provider search and can receive new support requests.',
      'Iri mu bikorwa: igaragara mu ishakisha kandi ishobora guhabwa ubufasha.'),
    ARCHIVED: t.x('Removed from active coordination without destroying the support history — for a beneficiary who has moved away or no longer needs support. The login is deactivated.',
      "Ikurwa mu bikorwa ariko amateka y'ubufasha akomeza kubaho."),
    DECEASED: t.x('Recorded with dignity rather than left as an active case. The login is deactivated and the full support history is retained.',
      'Yandikwa mu cyubahiro; konti ihagarikwa naho amateka agumaho.'),
  }[status]), [status, t]);

  return (
    <FormModal
      open onClose={onClose} size="sm" busy={m.busy} error={m.error}
      onSubmit={() => m.run(() => post(`/registry/${b.id}/status`, { status }), {
        success: `${b.code} → ${status.toLowerCase()}`,
        then: onDone,
      })}
      title={t.x(`Record status — ${b.code}`, `Imimerere — ${b.code}`)}
      subtitle={t.x('A registry that is not maintained decays. Status is how a record leaves active coordination without its history being lost.',
        'Registry itavugururwa irangirika.')}
      submitLabel={t.x('Update status', 'Hindura')}
    >
      <label className="field-label" htmlFor="st-sel">{t.x('New status', 'Imimerere nshya')}</label>
      <select id="st-sel" className="app-select" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="ACTIVE">{t('ACTIVE')}</option>
        <option value="ARCHIVED">{t('ARCHIVED')}</option>
        <option value="DECEASED">{t('DECEASED')}</option>
      </select>
      <p className="modal-sub" style={{ marginTop: 12 }}>{help}</p>
    </FormModal>
  );
}
