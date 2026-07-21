import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../../lib/api.js';
import { useUI } from '../../context/UIContext.jsx';
import { SECTORS } from '../../lib/constants.js';
import { DISABILITY, DIFFICULTY } from '../../lib/i18n.js';

const BLANK = {
  fullName: '', nationalId: '', sector: SECTORS[0], cell: '', village: '', guardianName: '',
  email: '', dailyChallenges: '', supportNeeds: '', consentGiven: false,
  impairments: [{ type: 'seeing', level: 'some' }],
};

// Officer registers a beneficiary. Consent is mandatory (Law 058/2021),
// the support need is required (a category alone cannot say what a person
// needs), and the backend detects duplicates — returning the candidates so
// the officer decides rather than being silently blocked.
export default function RegisterBeneficiaryPage() {
  const { t, say } = useUI();
  const navigate = useNavigate();
  const [f, setF] = useState(BLANK);
  const [err, setErr] = useState('');
  const [dups, setDups] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setImp = (i, k, v) => setF({ ...f, impairments: f.impairments.map((d, j) => (j === i ? { ...d, [k]: v } : d)) });
  const addImp = () => setF({ ...f, impairments: [...f.impairments, { type: 'hearing', level: 'some' }] });
  const delImp = (i) => setF({ ...f, impairments: f.impairments.filter((_, j) => j !== i) });

  async function attempt(allowDuplicate) {
    setErr('');
    if (!f.fullName.trim() || !f.sector) return setErr(t.x('Full name and sector are required.', "Izina n'umurenge birakenewe."));
    if (!f.supportNeeds.trim())
      return setErr(
        t.x(
          'Support needs are required — a disability category alone cannot say what a person needs.',
          'Ubufasha akeneye burakenewe.',
        ),
      );
    if (!f.impairments.length) return setErr(t.x('Record at least one impairment.', 'Andika nibura ubumuga bumwe.'));
    if (!f.consentGiven)
      return setErr(
        t.x(
          'Informed consent is required before storing sensitive disability data (Law No. 058/2021).',
          'Uruhushya rurakenewe (Itegeko 058/2021).',
        ),
      );

    setBusy(true);
    try {
      const res = await post('/registry', { ...f, allowDuplicate });
      setDone({ code: res.beneficiary.code, email: res.credentials?.emailedTo, mediated: res.mediatedAccess });
      setDups(null);
      say(t.x(`${res.beneficiary.code} registered`, `${res.beneficiary.code} yanditswe`));
    } catch (e) {
      if (e.status === 409 && e.data?.duplicates) setDups(e.data.duplicates);
      else setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="success">
        <div className="big">📧</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginTop: 6 }}>
          {t.x('Beneficiary registered', 'Uwunguka yanditswe')}
        </div>
        <div className="code" style={{ fontSize: 22, margin: '8px 0' }}>
          {done.code}
        </div>
        <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
          {done.email ? (
            <>
              {t.x('Account created; login credentials emailed to', 'Konti yakozwe; imyirondoro yoherejwe kuri')}{' '}
              <b>{done.email}</b>.
            </>
          ) : (
            t.x(
              'No email address recorded — guardian- and officer-mediated access apply. This is a legitimate path, not a failure.',
              'Nta imeyili — bizanyura ku murezi cyangwa umukozi.',
            )
          )}
        </div>
        <div className="row-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="btn" onClick={() => navigate('/officer/registry')}>
            {t.x('Open registry', 'Fungura registry')}
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setF(BLANK);
              setDone(null);
              setErr('');
            }}
          >
            {t.x('Register another', 'Andika undi')}
          </button>
        </div>
      </div>
    );

  return (
    <div className="card" style={{ marginTop: 22, maxWidth: 780 }}>
      <div className="card-t">{t.x('Register a beneficiary', 'Andika uwunguka')}</div>
      <small className="hint">
        {t.x(
          'Record the impairment, the daily challenges and the support needs separately — a category alone cannot express what a person actually requires.',
          "Andika ubumuga, ingorane n'ubufasha bukenewe ukwabyo.",
        )}
      </small>
      <div className="form-grid">
        <div>
          <label>{t.x('Full name', 'Amazina')} *</label>
          <input className="input" value={f.fullName} onChange={up('fullName')} />
        </div>
        <div>
          <label>{t.x('National ID', 'Indangamuntu')}</label>
          <input className="input" value={f.nationalId} onChange={up('nationalId')} />
        </div>
        <div>
          <label>{t.x('Sector', 'Umurenge')} *</label>
          <select className="input" value={f.sector} onChange={up('sector')}>
            {SECTORS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label>{t.x('Cell', 'Akagari')}</label>
          <input className="input" value={f.cell} onChange={up('cell')} />
        </div>
        <div>
          <label>{t.x('Village', 'Umudugudu')}</label>
          <input className="input" value={f.village} onChange={up('village')} />
        </div>
        <div>
          <label>{t.x('Guardian (if any)', 'Umurezi')}</label>
          <input className="input" value={f.guardianName} onChange={up('guardianName')} />
        </div>
        <div className="full">
          <label>{t.x('Email for login credentials (optional)', 'Imeyili yo kohererezwaho konti')}</label>
          <input
            className="input"
            value={f.email}
            onChange={up('email')}
            placeholder={t.x('Leave empty if none — mediated access applies', 'Siga ubusa niba nta yo ihari')}
          />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={{ fontWeight: 700, fontSize: 14 }}>
          {t.x('Impairment (Washington Group Short Set)', 'Ubumuga (Washington Group)')} *
        </label>
        {f.impairments.map((d, i) => (
          <div className="wg" key={i}>
            <select
              className="input"
              value={d.type}
              onChange={(e) => setImp(i, 'type', e.target.value)}
              aria-label="Impairment type"
            >
              {Object.keys(DISABILITY).map((k) => (
                <option key={k} value={k}>
                  {t.d(k)}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={d.level}
              onChange={(e) => setImp(i, 'level', e.target.value)}
              aria-label="Difficulty level"
            >
              {Object.keys(DIFFICULTY).map((k) => (
                <option key={k} value={k}>
                  {t.diff(k)}
                </option>
              ))}
            </select>
            {f.impairments.length > 1 ? (
              <button className="btn red sm" onClick={() => delImp(i)} aria-label="Remove impairment">
                ✕
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={addImp}>
          + {t.x('Add impairment', 'Ongeraho')}
        </button>
      </div>

      <div className="form-grid">
        <div className="full">
          <label>{t.x('Daily challenges', 'Ingorane za buri munsi')}</label>
          <textarea
            className="input"
            value={f.dailyChallenges}
            onChange={up('dailyChallenges')}
            placeholder={t.x('What does this person struggle with day to day?', 'Ni izihe ngorane afite?')}
          />
        </div>
        <div className="full">
          <label>{t.x('Support needs', 'Ubufasha akeneye')} *</label>
          <textarea
            className="input"
            value={f.supportNeeds}
            onChange={up('supportNeeds')}
            placeholder={t.x('What would actually help?', 'Ni ubuhe bufasha bwamufasha?')}
          />
        </div>
      </div>

      <label className="consent">
        <input
          type="checkbox"
          checked={f.consentGiven}
          onChange={(e) => {
            setF({ ...f, consentGiven: e.target.checked });
            setErr('');
          }}
        />
        <span>
          {t.x(
            'The beneficiary (or guardian) has given informed consent to store this sensitive data, under Law No. 058/2021 on the protection of personal data and privacy.',
            "Uwunguka cyangwa umurezi yatanze uruhushya rwo kubika aya makuru y'ibanga (Itegeko 058/2021).",
          )}
        </span>
      </label>

      {err && (
        <div className="warn" role="alert">
          {err}
        </div>
      )}

      {dups && dups.length > 0 && (
        <div className="warn" role="alert">
          <b>{t.x('Possible duplicate detected', 'Hari uwo asa nawe')}:</b>
          <div style={{ marginTop: 6 }}>
            {dups.map((d) => (
              <div key={d.id}>
                • {d.fullName} <span className="code">{d.code}</span> — {d.sector}, {d.village}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            {t.x(
              'The registry is meant to hold one record per person. Register anyway only if this is genuinely a different person.',
              'Registry igomba kugira inyandiko imwe kuri buri muntu.',
            )}
          </div>
          <div className="row-actions">
            <button className="btn amber sm" onClick={() => attempt(true)} disabled={busy}>
              {t.x('Register anyway', 'Komeza wandike')}
            </button>
            <button className="btn ghost sm" onClick={() => setDups(null)}>
              {t.x('Go back and edit', 'Subira usubiremo')}
            </button>
          </div>
        </div>
      )}

      <button className="btn block" style={{ marginTop: 16 }} onClick={() => attempt(false)} disabled={busy}>
        {busy ? t.x('Registering…', 'Birandikwa…') : t.x('Register & email credentials', 'Andika wohereze konti')}
      </button>
    </div>
  );
}
