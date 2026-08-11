import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Plus, UserCheck, SearchCheck } from 'lucide-react';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { useMutation } from '../../lib/useMutation.js';
import { useDebounced } from '../../lib/useDebounced.js';
import { SECTORS } from '../../lib/constants.js';
import { DISABILITY, DIFFICULTY } from '../../lib/i18n.js';
import { Card } from '../../components/ui.jsx';

const BLANK = {
  fullName: '', nationalId: '', sector: SECTORS[0], cell: '', village: '', guardianName: '',
  email: '', dailyChallenges: '', supportNeeds: '', consentGiven: false,
  impairments: [{ type: 'seeing', level: 'some' }],
};

// ─────────────────────────────────────────────────────────────
// Officer registers a beneficiary.
//
// The record separates the impairment from the daily challenges and from the
// support needs, because a category alone ("walking, a lot of difficulty")
// cannot say what a person actually requires. Consent is mandatory before any
// of it is stored (Law No. 058/2021 — disability status is sensitive personal
// data).
//
// Duplicate detection runs twice over, and deliberately so. It runs *while the
// officer types*, so a second record is prevented before the form has been
// filled in rather than rejected after five minutes of typing; and it runs
// again on the server at submission, because a check that only lives in the
// browser is not a check. Either way the candidates are shown and the officer
// decides — the registry cannot tell two people with the same name in the
// same sector apart, and silently blocking the second one would erase them.
// ─────────────────────────────────────────────────────────────
export default function RegisterBeneficiaryPage() {
  const { t, say } = useUI();
  const navigate = useNavigate();
  const nameRef = useRef(null);
  const [f, setF] = useState(BLANK);
  const [dups, setDups] = useState(null);       // candidates returned by the 409
  const [early, setEarly] = useState([]);       // candidates found while typing
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const m = useMutation();

  const up = (k) => (e) => { setF({ ...f, [k]: e.target.value }); m.reset(); };
  const setImp = (i, k, v) => setF({ ...f, impairments: f.impairments.map((d, j) => (j === i ? { ...d, [k]: v } : d)) });
  const delImp = (i) => setF({ ...f, impairments: f.impairments.filter((_, j) => j !== i) });

  const used = new Set(f.impairments.map((d) => d.type));
  const nextFree = Object.keys(DISABILITY).find((k) => !used.has(k));
  const addImp = () => nextFree && setF({ ...f, impairments: [...f.impairments, { type: nextFree, level: 'some' }] });

  // ── Live duplicate pre-check ──
  // Debounced so typing a name is one query, not one per letter.
  const probeName = useDebounced(f.fullName.trim(), 500);
  const probeId = useDebounced(f.nationalId.trim(), 500);
  useEffect(() => {
    if (done) return undefined;
    if (probeName.length < 3 && probeId.length < 3) { setEarly([]); return undefined; }
    let alive = true;
    post('/registry/check-duplicate', { fullName: probeName, nationalId: probeId, sector: f.sector })
      .then((rows) => alive && setEarly(rows || []))
      .catch(() => alive && setEarly([]));   // the advisory check must never block the form
    return () => { alive = false; };
  }, [probeName, probeId, f.sector, done]);

  function validate() {
    if (!f.fullName.trim() || !f.sector) {
      return t.x('Full name and sector are required.', "Izina n'umurenge birakenewe.");
    }
    if (!f.supportNeeds.trim()) {
      return t.x('Support needs are required — a disability category alone cannot say what a person needs.',
        'Ubufasha akeneye burakenewe — ubwoko bw\'ubumuga bwonyine ntibuvuga icyo umuntu akeneye.');
    }
    if (!f.impairments.length) return t.x('Record at least one impairment.', 'Andika nibura ubumuga bumwe.');
    if (!f.consentGiven) {
      return t.x('Informed consent is required before storing sensitive disability data (Law No. 058/2021).',
        'Uruhushya rurakenewe mbere yo kubika aya makuru (Itegeko 058/2021).');
    }
    return null;
  }

  // Submitted by hand rather than through useMutation.run: a 409 here is not
  // a failure to report, it is the server handing back the candidate records
  // for the officer to look at, and that payload is only reachable from the
  // raw error object.
  async function submit(allowDuplicate) {
    const problem = validate();
    if (problem) return m.setError(problem);
    setDups(null);
    m.setError('');
    setBusy(true);
    try {
      const res = await post('/registry', { ...f, allowDuplicate });
      setDone({ code: res.beneficiary.code, email: res.credentials?.emailedTo, mediated: res.mediatedAccess });
      say(t.x(`${res.beneficiary.code} registered`, `${res.beneficiary.code} yanditswe`));
    } catch (e) {
      if (e.status === 409 && e.data?.duplicates) setDups(e.data.duplicates);
      else m.setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="success">
        <div className="big" aria-hidden="true">📧</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginTop: 6 }}>
          {t.x('Beneficiary registered', 'Uwunguka yanditswe')}
        </div>
        <div className="code" style={{ fontSize: 22, margin: '8px 0' }}>{done.code}</div>
        <div style={{ color: 'var(--muted)', lineHeight: 1.55, margin: '0 auto', maxInlineSize: '58ch' }}>
          {done.email ? (
            <>
              {t.x('Account created; login credentials emailed to', 'Konti yakozwe; imyirondoro yoherejwe kuri')}{' '}
              <b>{done.email}</b>.{' '}
              {t.x('They should change the temporary password the first time they sign in.',
                'Bagomba guhindura ijambobanga ry\'agateganyo ubwa mbere binjiye.')}
            </>
          ) : (
            t.x('No email address recorded — guardian- and officer-mediated access apply. This is a legitimate path, not a failure.',
              'Nta imeyili — bizanyura ku murezi cyangwa umukozi. Ni inzira yemewe, si ikosa.')
          )}
        </div>
        <div className="row-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="btn" onClick={() => navigate('/officer/registry')}>
            {t.x('Open registry', 'Fungura registry')}
          </button>
          <button
            className="btn ghost"
            onClick={() => { setF(BLANK); setDone(null); setDups(null); setEarly([]); m.reset(); nameRef.current?.focus(); }}
          >
            {t.x('Register another', 'Andika undi')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Card style={{ marginTop: 22, maxWidth: 820 }}>
      <div className="card-t">{t.x('Register a beneficiary', 'Andika uwunguka')}</div>
      <small className="hint">
        {t.x('Record the impairment, the daily challenges and the support needs separately — a category alone cannot express what a person actually requires.',
          "Andika ubumuga, ingorane n'ubufasha bukenewe ukwabyo.")}
      </small>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(false); }}
        noValidate
      >
        {/* ── Identity & location ── */}
        <div className="form-grid">
          <div>
            <label className="field-label" htmlFor="rb-name">{t.x('Full name', 'Amazina')} *</label>
            <input ref={nameRef} id="rb-name" className="app-input" value={f.fullName} onChange={up('fullName')}
              autoComplete="off" />
          </div>
          <div>
            <label className="field-label" htmlFor="rb-nid">{t.x('National ID', 'Indangamuntu')}</label>
            <input id="rb-nid" className="app-input" value={f.nationalId} onChange={up('nationalId')}
              inputMode="numeric" autoComplete="off" />
          </div>
          <div>
            <label className="field-label" htmlFor="rb-sector">{t.x('Sector', 'Umurenge')} *</label>
            <select id="rb-sector" className="app-select" value={f.sector} onChange={up('sector')}>
              {SECTORS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="rb-cell">{t.x('Cell', 'Akagari')}</label>
            <input id="rb-cell" className="app-input" value={f.cell} onChange={up('cell')} />
          </div>
          <div>
            <label className="field-label" htmlFor="rb-village">{t.x('Village', 'Umudugudu')}</label>
            <input id="rb-village" className="app-input" value={f.village} onChange={up('village')} />
          </div>
          <div>
            <label className="field-label" htmlFor="rb-guardian">{t.x('Guardian (if any)', 'Umurezi (niba ahari)')}</label>
            <input id="rb-guardian" className="app-input" value={f.guardianName} onChange={up('guardianName')} />
          </div>
          <div className="full">
            <label className="field-label" htmlFor="rb-email">
              {t.x('Email for login credentials (optional)', 'Imeyili yo kohererezwaho konti (si itegeko)')}
            </label>
            <input id="rb-email" type="email" className="app-input" value={f.email} onChange={up('email')}
              autoCapitalize="none" spellCheck="false"
              placeholder={t.x('Leave empty if none — mediated access applies', 'Siga ubusa niba nta yo ihari')} />
            <small className="hint">
              {t.x('With an address, the system creates their account and emails a temporary password so they can read their own record. Without one, guardian- and officer-mediated access is the legitimate path.',
                "Iyo ihari, sisitemu ikora konti ikohereza ijambobanga ry'agateganyo. Iyo idahari, banyura ku murezi cyangwa umukozi.")}
            </small>
          </div>
        </div>

        {/* ── Live duplicate warning ── */}
        {early.length > 0 && !dups && (
          <div
            className="warn" role="status"
            style={{ background: 'var(--amber-soft)', borderColor: 'var(--amber)', color: 'var(--amber)' }}
          >
            <b>
              <SearchCheck className="h-[15px] w-[15px]" aria-hidden="true" style={{ display: 'inline', verticalAlign: -3, marginRight: 6 }} />
              {t.x('A similar record already exists', 'Hari inyandiko isa n\'iyi')}
            </b>
            <div style={{ marginTop: 6 }}>
              {early.map((d) => (
                <div key={d.id}>
                  • {d.fullName} <span className="code">{d.code}</span> — {[d.sector, d.village].filter(Boolean).join(', ')}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              {t.x('Check this is not the same person before you continue. The registry is meant to hold one record per person.',
                'Reba neza ko atari umuntu umwe mbere yo gukomeza. Registry igira inyandiko imwe kuri buri muntu.')}
            </div>
          </div>
        )}

        {/* ── Impairments ── */}
        <fieldset style={{ marginTop: 20, border: 0 }}>
          <legend className="field-label" style={{ fontSize: 13, color: 'var(--text)' }}>
            {t.x('Impairment (Washington Group Short Set)', 'Ubumuga (Washington Group)')} *
          </legend>
          {f.impairments.map((d, i) => (
            <div className="wg" key={i}>
              <div>
                <label className="sr-only" htmlFor={`rb-imp-${i}`}>
                  {t.x(`Impairment type ${i + 1}`, `Ubwoko bw'ubumuga ${i + 1}`)}
                </label>
                <select id={`rb-imp-${i}`} className="app-select" value={d.type}
                  onChange={(e) => setImp(i, 'type', e.target.value)}>
                  {Object.keys(DISABILITY).map((k) => (
                    <option key={k} value={k} disabled={k !== d.type && used.has(k)}>{t.d(k)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sr-only" htmlFor={`rb-lvl-${i}`}>
                  {t.x(`Difficulty level ${i + 1}`, `Urugero rw'ingorane ${i + 1}`)}
                </label>
                <select id={`rb-lvl-${i}`} className="app-select" value={d.level}
                  onChange={(e) => setImp(i, 'level', e.target.value)}>
                  {Object.keys(DIFFICULTY).map((k) => <option key={k} value={k}>{t.diff(k)}</option>)}
                </select>
              </div>
              {f.impairments.length > 1 ? (
                <button type="button" className="btn red sm" onClick={() => delImp(i)}
                  aria-label={t.x(`Remove ${t.d(d.type)}`, `Kuraho ${t.d(d.type)}`)}>
                  <Trash2 className="h-[14px] w-[14px]" aria-hidden="true" />
                </button>
              ) : <span />}
            </div>
          ))}
          {nextFree ? (
            <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={addImp}>
              <Plus className="h-[14px] w-[14px]" aria-hidden="true" /> {t.x('Add impairment', 'Ongeraho ubumuga')}
            </button>
          ) : (
            <small className="hint" style={{ display: 'block', marginTop: 8 }}>
              {t.x('All six impairment types have been recorded.', 'Ubwoko bwose bwose bwanditswe.')}
            </small>
          )}
        </fieldset>

        {/* ── What the impairment actually costs this person ── */}
        <div className="form-grid">
          <div className="full">
            <label className="field-label" htmlFor="rb-daily">{t.x('Daily challenges', 'Ingorane za buri munsi')}</label>
            <textarea id="rb-daily" className="app-input" style={{ minHeight: 78 }}
              value={f.dailyChallenges} onChange={up('dailyChallenges')}
              placeholder={t.x('What does this person struggle with day to day?', 'Ni izihe ngorane afite buri munsi?')} />
          </div>
          <div className="full">
            <label className="field-label" htmlFor="rb-needs">{t.x('Support needs', 'Ubufasha akeneye')} *</label>
            <textarea id="rb-needs" className="app-input" style={{ minHeight: 78 }}
              value={f.supportNeeds} onChange={up('supportNeeds')}
              placeholder={t.x('What would actually help?', 'Ni ubuhe bufasha bwamufasha koko?')} />
            <small className="hint">
              {t.x('This is the field a provider searches on, so write what would help rather than restating the impairment.',
                'Iki ni cyo provider ashakisha — andika icyamufasha, si ubumuga bwongewe.')}
            </small>
          </div>
        </div>

        {/* ── Consent (Law 058/2021) ── */}
        <label className="consent" htmlFor="rb-consent">
          <input
            id="rb-consent" type="checkbox" checked={f.consentGiven}
            onChange={(e) => { setF({ ...f, consentGiven: e.target.checked }); m.reset(); }}
          />
          <span>
            {t.x('The beneficiary (or guardian) has given informed consent to store this sensitive data, under Law No. 058/2021 on the protection of personal data and privacy.',
              "Uwunguka cyangwa umurezi yatanze uruhushya rwo kubika aya makuru y'ibanga (Itegeko 058/2021).")}
          </span>
        </label>

        {m.error && <div className="warn" role="alert">{m.error}</div>}

        {/* ── Server-side duplicate decision ── */}
        {dups?.length > 0 && (
          <div className="warn" role="alert">
            <b>{t.x('Possible duplicate detected', 'Hari uwo asa nawe')}:</b>
            <div style={{ marginTop: 6 }}>
              {dups.map((d) => (
                <div key={d.id}>
                  • {d.fullName} <span className="code">{d.code}</span> — {[d.sector, d.village].filter(Boolean).join(', ')}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              {t.x('The registry is meant to hold one record per person. Register anyway only if this is genuinely a different person.',
                'Registry igomba kugira inyandiko imwe kuri buri muntu. Komeza gusa niba ari undi muntu koko.')}
            </div>
            <div className="row-actions">
              <button type="button" className="btn amber sm" onClick={() => submit(true)} disabled={busy}>
                {t.x('Register anyway', 'Komeza wandike')}
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setDups(null)}>
                {t.x('Go back and edit', 'Subira usubiremo')}
              </button>
            </div>
          </div>
        )}

        <button className="btn block" style={{ marginTop: 18 }} type="submit" disabled={busy}>
          <UserCheck className="h-[16px] w-[16px]" aria-hidden="true" />
          {busy
            ? t.x('Registering…', 'Birandikwa…')
            : t.x('Register & email credentials', 'Andika wohereze konti')}
        </button>
      </form>
    </Card>
  );
}
