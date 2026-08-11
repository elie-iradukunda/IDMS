// ─────────────────────────────────────────────────────────────
// notify.js — the single outbound-messaging adapter.
//
// Functional requirement (Table 3.4): "Notify users of decisions,
// deliveries and new opportunities by email or message." In-app
// notifications are written by registry.service.notify(); this module
// is the email half of that requirement, and the only place that talks
// to a mail provider, so an SMS/USSD channel can be added here without
// touching the business logic.
//
// Delivery is best-effort by design: an email provider being down must
// never roll back a registration or block an officer's decision. Every
// send is wrapped, failures are logged, and the caller gets a result
// object rather than an exception.
// ─────────────────────────────────────────────────────────────
import nodemailer from 'nodemailer';
import 'dotenv/config';

// ── Transport ────────────────────────────────────────────────
// MAIL_PROVIDER=gmail  → Gmail with an App Password (2FA accounts).
// MAIL_PROVIDER=smtp   → any generic SMTP host.
// unset / no credentials → dev mode: emails are logged, not sent.
const PROVIDER = (process.env.MAIL_PROVIDER || '').toLowerCase();

// Google displays app passwords in groups of four ("abcd efgh ijkl mnop").
// Users copy them with the spaces, which Gmail's SMTP rejects.
const cleanPassword = (p) => (p || '').replace(/\s+/g, '');

function buildTransport() {
  if (PROVIDER === 'gmail' && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: cleanPassword(process.env.GMAIL_APP_PASSWORD) },
      pool: true,          // reuse one connection for bulk opportunity mail
      maxConnections: 3,
      maxMessages: 50,
    });
  }
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      pool: true,
    });
  }
  return null;
}

const transport = buildTransport();

const FROM = process.env.MAIL_FROM
  || (PROVIDER === 'gmail' && process.env.GMAIL_USER
    ? `"Disability Support IMS" <${process.env.GMAIL_USER}>`
    : process.env.SMTP_FROM || 'no-reply@disability-ims.rw');

const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Demo and test data contain fictional addresses (…@beneficiary.rw). Sending
// real mail at a domain that does not exist produces bounces, and a run of
// bounces is what gets a sending account throttled or blocked. When
// MAIL_REDIRECT_TO is set, every message is delivered there instead, with the
// intended recipient stated in the subject — so the full notification flow can
// be exercised end to end without mailing addresses that cannot receive.
// Leave it empty in production.
const REDIRECT_TO = (process.env.MAIL_REDIRECT_TO || '').trim();

// Verify once at startup so a misconfigured password is discovered on
// deploy rather than on the first beneficiary registration.
export async function verifyMailer() {
  if (!transport) {
    console.log('[mail] No provider configured — emails will be logged to the console.');
    return { ready: false, mode: 'console' };
  }
  try {
    await transport.verify();
    console.log(`[mail] ${PROVIDER === 'gmail' ? 'Gmail' : 'SMTP'} transport ready (from: ${FROM})`);
    return { ready: true, mode: PROVIDER || 'smtp' };
  } catch (e) {
    console.error('[mail] Transport verification FAILED:', e.message);
    return { ready: false, mode: 'error', error: e.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Template
// ─────────────────────────────────────────────────────────────
// A single branded layout. Constraints that shaped it:
//  · Email clients strip <style> blocks unpredictably → all inline CSS.
//  · Outlook ignores flexbox/grid → table layout.
//  · Screen readers and low-vision users are the actual audience →
//    real headings, 15px+ body text, AA contrast, no text baked into
//    images (there are no images at all), and a text/plain alternative
//    that carries the whole message on its own.
//  · Kinyarwanda alongside English wherever the beneficiary is the reader.

const GREEN = '#087536';
const INK = '#12211a';
const MUTED = '#5b6b63';
const BORDER = '#dfe7e2';

const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TONES = {
  green: { bg: '#e7f6ed', bd: '#9fd9b6', fg: '#08532a' },
  amber: { bg: '#fdf3e2', bd: '#f0cc8a', fg: '#7a5410' },
  red:   { bg: '#fdecec', bd: '#f2b4b4', fg: '#8c2020' },
  blue:  { bg: '#e9f1fd', bd: '#a9c6f2', fg: '#1b4787' },
  gray:  { bg: '#f1f4f3', bd: '#d5ded9', fg: '#41504a' },
};

/**
 * @param {object} o
 * @param {string} o.title       main heading
 * @param {string} [o.preheader] inbox preview line
 * @param {string} [o.badge]     small status pill above the heading
 * @param {string} [o.tone]      badge/callout colour key
 * @param {string[]} [o.lines]   body paragraphs
 * @param {[string,string][]} [o.facts] label/value rows
 * @param {string} [o.callout]   emphasised box (e.g. a decision reason)
 * @param {{label:string,url:string}} [o.action] call-to-action button
 * @param {string} [o.footnote]  closing note
 */
function layout({ title, preheader = '', badge, tone = 'green', lines = [], facts = [], callout, action, footnote }) {
  const c = TONES[tone] || TONES.green;

  const factRows = facts.length ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;margin:22px 0 4px;border:1px solid ${BORDER};border-radius:10px;overflow:hidden">
      ${facts.map(([k, v], i) => `
      <tr style="background:${i % 2 ? '#ffffff' : '#f7faf8'}">
        <td style="padding:11px 16px;font-size:13px;color:${MUTED};border-bottom:1px solid ${BORDER}">${esc(k)}</td>
        <td style="padding:11px 16px;font-size:15px;color:${INK};font-weight:600;border-bottom:1px solid ${BORDER}">${esc(v)}</td>
      </tr>`).join('')}
    </table>` : '';

  const calloutBox = callout ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0">
      <tr><td style="background:${c.bg};border-left:4px solid ${c.bd};border-radius:8px;padding:14px 16px;
                     font-size:15px;line-height:1.6;color:${c.fg}">${esc(callout)}</td></tr>
    </table>` : '';

  const button = action ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px">
      <tr><td style="background:${GREEN};border-radius:10px">
        <a href="${esc(action.url)}"
           style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;
                  color:#ffffff;text-decoration:none;border-radius:10px">${esc(action.label)}</a>
      </td></tr>
    </table>` : '';

  return `<!doctype html>
<html lang="rw"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#eef3f0;
             font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f0;padding:28px 12px">
 <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;
                box-shadow:0 2px 14px rgba(8,117,54,.10)">

   <tr><td style="background:${GREEN};padding:20px 28px">
     <table role="presentation" width="100%"><tr>
       <td style="font-size:17px;font-weight:800;color:#ffffff;letter-spacing:.2px">
         Disability Support IMS
       </td>
       <td align="right" style="font-size:11px;color:rgba(255,255,255,.78);text-transform:uppercase;letter-spacing:.16em">
         Kamonyi District
       </td>
     </tr></table>
   </td></tr>

   <tr><td style="padding:30px 28px 34px">
     ${badge ? `<span style="display:inline-block;background:${c.bg};color:${c.fg};border:1px solid ${c.bd};
                 border-radius:999px;padding:5px 13px;font-size:12px;font-weight:700;
                 letter-spacing:.04em;margin-bottom:14px">${esc(badge)}</span>` : ''}
     <h1 style="margin:6px 0 16px;font-size:22px;line-height:1.3;color:${INK};font-weight:800">${esc(title)}</h1>
     ${lines.map((l) => `<p style="margin:0 0 13px;font-size:15.5px;line-height:1.65;color:${MUTED}">${esc(l)}</p>`).join('')}
     ${calloutBox}
     ${factRows}
     ${button}
     ${footnote ? `<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:${MUTED}">${esc(footnote)}</p>` : ''}
   </td></tr>

   <tr><td style="background:#f7faf8;border-top:1px solid ${BORDER};padding:18px 28px">
     <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${MUTED}">
       Inclusive Disability Support Information Management System · Kamonyi District, Rwanda
     </p>
     <p style="margin:0;font-size:11.5px;line-height:1.6;color:#8a978f">
       This message contains information about your own record only. Ubu butumwa bukubiyemo
       amakuru yerekeye inyandiko yawe gusa. Please do not reply to this address.
     </p>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;
}

// Plain-text alternative — carries the full message for text-only clients,
// low-bandwidth readers and screen readers that prefer text/plain.
function plain({ title, lines = [], facts = [], callout, action, footnote }) {
  return [
    title,
    '='.repeat(Math.min(String(title).length, 60)),
    '',
    ...lines,
    ...(callout ? ['', callout] : []),
    ...(facts.length ? ['', ...facts.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(action ? ['', `${action.label}: ${action.url}`] : []),
    ...(footnote ? ['', footnote] : []),
    '',
    '— Disability Support IMS · Kamonyi District',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────
// Send
// ─────────────────────────────────────────────────────────────
async function send(to, subject, spec) {
  if (!to) return { delivered: false, skipped: 'no-address' };

  const redirected = REDIRECT_TO && REDIRECT_TO !== to;
  const recipient = redirected ? REDIRECT_TO : to;
  const finalSubject = redirected ? `[to: ${to}] ${subject}` : subject;
  const finalSpec = redirected
    ? { ...spec, footnote: [`Redirected from ${to} (MAIL_REDIRECT_TO is set).`, spec.footnote].filter(Boolean).join(' ') }
    : spec;

  const html = layout(finalSpec);
  const text = plain(finalSpec);

  if (!transport) {
    console.log(`[email:dev] to=${to} | ${subject}\n${text}\n`);
    return { delivered: false, logged: true };
  }
  try {
    const info = await transport.sendMail({ from: FROM, to: recipient, subject: finalSubject, text, html });
    return { delivered: true, messageId: info.messageId, redirected };
  } catch (e) {
    // Never let a mail failure break the workflow it was reporting on.
    console.error(`[mail] send failed to=${to} subject="${subject}": ${e.message}`);
    return { delivered: false, error: e.message };
  }
}

// Fire-and-forget for callers inside a database transaction: the email
// must not hold the transaction open, and must not fail it.
export const sendAsync = (fn) => { Promise.resolve(fn).catch(() => {}); };

const signIn = { label: 'Sign in / Injira', url: APP_URL };

// ─────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────

// 1. Account credentials issued at registration (Objective 2).
export const sendCredentials = ({ to, name, code, tempPassword }) => send(
  to, 'Your Disability Support account · Konti yawe',
  {
    badge: 'ACCOUNT CREATED',
    tone: 'green',
    preheader: `Your record ${code} is registered. Sign in with the temporary password below.`,
    title: `Muraho ${name}, your account is ready`,
    lines: [
      `Your beneficiary record ${code} has been registered by your local officer, and an account has been created so you can see your own record, follow your support requests and receive opportunities.`,
      `Umwirondoro wawe ${code} wanditswe n'umukozi w'akarere. Wahawe konti kugira ngo urebe inyandiko yawe, ukurikirane ibyifuzo byawe kandi ubone amahirwe.`,
    ],
    facts: [
      ['Record / Inyandiko', code],
      ['Email / Imeyili', to],
      ["Temporary password / Ijambobanga ry'agateganyo", tempPassword],
    ],
    action: signIn,
    footnote: 'Please change this password after your first sign-in. Nyamuneka uhindure iri jambobanga nyuma yo kwinjira bwa mbere. Your record is read-only: if something in it is wrong, use "Request a correction" and your officer will review it.',
  },
);

// 2. Password reset (single-use token, 1 hour).
export const sendResetToken = ({ to, token }) => send(
  to, 'Password reset · Guhindura ijambobanga',
  {
    badge: 'PASSWORD RESET',
    tone: 'amber',
    preheader: 'Your single-use reset code, valid for one hour.',
    title: 'Reset your password',
    lines: [
      'Use the code below to set a new password. It can be used once and expires in one hour.',
      'Koresha iyi kode uhindure ijambobanga. Ikoreshwa rimwe gusa kandi imara isaha imwe.',
    ],
    callout: token,
    footnote: 'If you did not ask for this, you can ignore this message — your password stays unchanged. Niba atari wowe wabisabye, irengagize ubu butumwa.',
  },
);

// 3. New opportunity / announcement published (Objective 4).
export const sendOpportunity = ({ to, kind, title, org, detail }) => send(
  to, `New ${kind}: ${title}`,
  {
    badge: String(kind || 'opportunity').toUpperCase(),
    tone: 'blue',
    preheader: `${title}${org ? ` — ${org}` : ''}`,
    title,
    lines: [
      'A new opportunity has been published for registered beneficiaries.',
      'Hari amahirwe mashya yatangajwe ku bunganirwa banditswe.',
      ...(detail ? [detail] : []),
    ],
    facts: [['Type / Ubwoko', kind], ...(org ? [['Published by / Batanze', org]] : [])],
    action: signIn,
  },
);

// 3b. An opportunity that can be applied to — the email says how to respond.
// Telling someone an opportunity exists and not telling them they can act on
// it is most of the way back to the exclusion the registry exists to end.
export const sendOpportunityOpen = ({ to, kind, title, org, detail, deadline, slots }) => send(
  to, `New ${kind}: ${title} — you can apply`,
  {
    badge: 'OPEN FOR APPLICATIONS',
    tone: 'blue',
    preheader: `${title}${deadline ? ` — apply by ${deadline}` : ''}`,
    title,
    lines: [
      'A new opportunity has been published for registered beneficiaries, and you can apply for it yourself by signing in.',
      "Hari amahirwe mashya yatangajwe ku bunganirwa banditswe. Urashobora kuyasaba ubwawe winjiye muri sisitemu.",
      ...(detail ? [detail] : []),
      "If you cannot use the website, your local officer can apply on your behalf — ask them. Niba udashobora gukoresha sisitemu, umukozi w'akarere abikora mu izina ryawe.",
    ],
    facts: [
      ['Type / Ubwoko', kind],
      ...(org ? [['Published by / Batanze', org]] : []),
      ...(deadline ? [['Closing date / Itariki ntarengwa', deadline]] : []),
      ...(slots ? [['Places available / Imyanya', String(slots)]] : []),
    ],
    action: { label: 'Sign in and apply / Injira usabe', url: APP_URL },
    footnote: 'You will be told the outcome of your application, with the reason for it. Uzamenyeshwa icyemezo cyafashwe n\'impamvu yacyo.',
  },
);

// 3c. Somebody applied — to whoever published the opportunity.
export const sendApplicationReceived = ({ to, title, kind, beneficiary, code, sector, note, onBehalf }) => send(
  to, `New application: ${title}`,
  {
    badge: 'APPLICATION RECEIVED',
    tone: 'blue',
    preheader: `${beneficiary} (${code}) applied to ${title}`,
    title: 'Someone applied to your posting',
    lines: [
      `${beneficiary} has applied to "${title}".`,
      ...(onBehalf
        ? ['This application was submitted by a local officer on the beneficiary\'s behalf, because they could not use the form themselves.']
        : []),
      'Review it in the system and record a decision. The applicant is shown the outcome and the reason for it.',
    ],
    ...(note ? { callout: note } : {}),
    facts: [
      ['Applicant / Usaba', `${beneficiary} (${code})`],
      ['Sector / Umurenge', sector || '—'],
      ['Opportunity / Amahirwe', `${title} (${kind})`],
    ],
    action: signIn,
  },
);

// 3d. The decision on an application — with the reason, as everywhere else.
export const sendApplicationDecision = ({ to, name, title, kind, status, reason, org }) => {
  const meta = {
    ACCEPTED: {
      badge: 'ACCEPTED', tone: 'green', subject: `You were accepted: ${title}`,
      head: 'Your application was accepted',
      lines: [
        `Muraho ${name}, your application to "${title}" was accepted.`,
        `Wemerewe muri "${title}". Uzahabwa amakuru y'ibikurikira.`,
      ],
    },
    SHORTLISTED: {
      badge: 'SHORTLISTED', tone: 'amber', subject: `Shortlisted: ${title}`,
      head: 'Your application has been shortlisted',
      lines: [
        `Muraho ${name}, your application to "${title}" has moved to the next stage.`,
        `Icyifuzo cyawe muri "${title}" cyageze ku ntambwe ikurikira.`,
      ],
    },
    DECLINED: {
      badge: 'NOT SELECTED', tone: 'gray', subject: `Outcome of your application: ${title}`,
      head: 'You were not selected this time',
      lines: [
        `Muraho ${name}, your application to "${title}" was not selected. The reason is recorded below, and applying again for future opportunities is welcome.`,
        `Ntiwatoranyijwe muri "${title}". Impamvu iri hasi. Ushobora kongera gusaba andi mahirwe azaza.`,
      ],
    },
  }[status];

  return send(to, meta.subject, {
    badge: meta.badge,
    tone: meta.tone,
    preheader: `${title}${org ? ` — ${org}` : ''}`,
    title: meta.head,
    lines: meta.lines,
    callout: reason,
    facts: [
      ['Opportunity / Amahirwe', title],
      ['Type / Ubwoko', kind],
      ...(org ? [['Organisation / Umuryango', org]] : []),
    ],
    action: signIn,
    footnote: 'Every decision on this system carries a recorded reason, so you can always ask what it was based on. Buri cyemezo gifite impamvu yanditse.',
  });
};

// 4. A support request was created for a beneficiary.
export const sendRequestCreated = ({ to, code, need, byRole }) => send(
  to, `Support request ${code} created`,
  {
    badge: 'UNDER REVIEW',
    tone: 'amber',
    preheader: `${code} — ${need}`,
    title: 'A support request was created for you',
    lines: [
      byRole === 'PROVIDER'
        ? 'A support provider has offered assistance matching your recorded need. Your local officer will review it.'
        : byRole === 'BENEFICIARY'
          ? 'Your support request has been recorded and sent to your local officer for review.'
          : 'Your local officer has created a support request on your behalf.',
      "Icyifuzo cy'ubufasha cyanditswe kandi kigeze ku mukozi w'akarere. Uzamenyeshwa icyemezo.",
    ],
    facts: [['Request / Icyifuzo', code], ['Need / Ubufasha', need], ['Status', 'Requested · Byasabwe']],
    action: signIn,
  },
);

// 5. Officer decision — approved (urgent/standard) or not eligible.
// The recorded reason is included because a decision that must be
// explained is a decision that must be justifiable.
export const sendDecision = ({ to, code, need, decision, reason }) => {
  const map = {
    urgent: {
      badge: 'APPROVED · URGENT', tone: 'red', title: 'Your support request was approved as urgent',
      line: 'Your request has been approved and escalated for priority support. You will be notified when distribution begins.',
    },
    standard: {
      badge: 'APPROVED', tone: 'green', title: 'Your support request was approved',
      line: 'Your request has been approved and queued for scheduled distribution.',
    },
    ineligible: {
      badge: 'NOT ELIGIBLE', tone: 'gray', title: 'Your support request was not approved',
      line: 'Your request was reviewed and recorded as not eligible. The reason is shown below. If you believe this is based on incorrect information in your record, you may request a correction.',
    },
  }[decision] || { badge: 'DECISION RECORDED', tone: 'gray', title: 'A decision was recorded on your request', line: '' };

  return send(to, `${code} — decision recorded`, {
    badge: map.badge,
    tone: map.tone,
    preheader: `${code}: ${map.badge}`,
    title: map.title,
    lines: [map.line, 'Icyemezo cyafashwe ku cyifuzo cyawe. Impamvu yanditswe iri hano hepfo.'].filter(Boolean),
    callout: reason ? `Reason recorded by the officer / Impamvu: ${reason}` : undefined,
    facts: [['Request / Icyifuzo', code], ['Need / Ubufasha', need]],
    action: signIn,
  });
};

// 6. Distribution started.
export const sendDistributing = ({ to, code, need, provider }) => send(
  to, `${code} — distribution started`,
  {
    badge: 'DISTRIBUTING',
    tone: 'blue',
    preheader: `${code} is on its way.`,
    title: 'Your support is being distributed',
    lines: [
      'Distribution of your approved support has started with the provider. You will receive a final confirmation once delivery is recorded.',
      'Gutanga ubufasha bwawe byatangiye. Uzamenyeshwa igihe bizaba byakiriwe.',
    ],
    facts: [['Request / Icyifuzo', code], ['Need / Ubufasha', need], ...(provider ? [['Provider / Utanga', provider]] : [])],
    action: signIn,
  },
);

// 7. Delivery confirmed — support history stored.
export const sendCompleted = ({ to, code, need }) => send(
  to, `${code} — support delivered`,
  {
    badge: 'COMPLETED',
    tone: 'green',
    preheader: `${code} has been delivered and recorded.`,
    title: 'Your support has been delivered',
    lines: [
      'Delivery has been confirmed and recorded in your support history. You can see the full timeline of this request when you sign in.',
      'Ubufasha bwawe bwatanzwe kandi bwanditswe mu mateka yawe.',
    ],
    facts: [['Request / Icyifuzo', code], ['Need / Ubufasha', need], ['Status', 'Completed · Byarangiye']],
    action: signIn,
  },
);

// 8. Correction request resolved by an officer.
export const sendCorrectionResolved = ({ to, applied, text }) => send(
  to, applied ? 'Your correction was applied' : 'Your correction request was reviewed',
  {
    badge: applied ? 'CORRECTION APPLIED' : 'CORRECTION REVIEWED',
    tone: applied ? 'green' : 'gray',
    preheader: applied ? 'Your record has been updated.' : 'Your officer has reviewed your correction request.',
    title: applied ? 'Your record has been corrected' : 'Your correction request was reviewed',
    lines: [
      applied
        ? 'Your local officer reviewed your request and updated the official record. Sign in to check that the record is now correct.'
        : 'Your local officer reviewed your request. The official record was not changed on this occasion. If you still believe it is incorrect, you may submit another request with more detail.',
      "Umukozi w'akarere yasuzumye icyifuzo cyawe cyo gukosora.",
    ],
    callout: text ? `You reported / Wavuze: ${text}` : undefined,
    action: signIn,
  },
);

// 9. Officer alert — a beneficiary submitted a correction request.
export const sendCorrectionFiled = ({ to, officerName, beneficiary, code, text }) => send(
  to, `Correction request from ${code}`,
  {
    badge: 'ACTION REQUIRED',
    tone: 'amber',
    preheader: `${beneficiary} (${code}) reported an error in their record.`,
    title: 'A beneficiary has challenged their record',
    lines: [
      `${officerName ? `${officerName}, a` : 'A'} beneficiary in your area has reported that something in their official record is incorrect. Only an officer may change the record, so this request is waiting for your review.`,
    ],
    callout: text,
    facts: [['Beneficiary', `${beneficiary} (${code})`]],
    action: { label: 'Review corrections', url: `${APP_URL}/officer/corrections` },
  },
);

// 10. Officer alert — a provider submitted a support offer.
export const sendOfferFiled = ({ to, code, need, provider, beneficiaryCode }) => send(
  to, `New provider offer ${code}`,
  {
    badge: 'AWAITING DECISION',
    tone: 'amber',
    preheader: `${provider} offered support for ${beneficiaryCode}.`,
    title: 'A provider has submitted a support offer',
    lines: ['A support provider has offered assistance matching a recorded need. It is waiting for your decision, which must carry a recorded reason.'],
    facts: [['Request', code], ['Need', need], ['Provider', provider], ['Beneficiary', beneficiaryCode]],
    action: { label: 'Review support requests', url: `${APP_URL}/officer/requests` },
  },
);

// 11. Staff account created by an administrator.
export const sendStaffAccount = ({ to, name, role, tempPassword }) => send(
  to, 'Your Disability Support IMS staff account',
  {
    badge: 'STAFF ACCOUNT',
    tone: 'blue',
    preheader: `A ${role} account has been created for you.`,
    title: `Welcome, ${name}`,
    lines: [
      `An administrator has created a ${role} account for you on the Inclusive Disability Support Information Management System.`,
      'Your permissions are attached to your role, not to you personally, and every action you take on a beneficiary record is recorded in the audit log.',
    ],
    facts: [['Email', to], ['Role', role], ['Temporary password', tempPassword]],
    action: signIn,
    footnote: 'Please change this password after your first sign-in.',
  },
);

// 12. Account deactivated.
export const sendAccountDeactivated = ({ to, name }) => send(
  to, 'Your account has been deactivated',
  {
    badge: 'ACCOUNT DEACTIVATED',
    tone: 'gray',
    preheader: 'You can no longer sign in to the Disability Support IMS.',
    title: `${name}, your account has been deactivated`,
    lines: [
      'An administrator has deactivated your account, so you can no longer sign in. Your records and support history are retained.',
      'If you believe this is a mistake, please contact the district administrator.',
    ],
  },
);
