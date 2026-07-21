// ─────────────────────────────────────────────────────────────
// notify.js — email/SMS adapter. The proposal issues login
// credentials by email; this is the single place that talks to a
// provider, so an SMS/USSD channel can be added here without
// touching the business logic.
// ─────────────────────────────────────────────────────────────
import nodemailer from 'nodemailer';
import 'dotenv/config';

let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

async function send({ to, subject, text }) {
  if (!transport) {
    // No SMTP configured (dev/demo): log instead of failing the workflow.
    console.log(`[email:dev] to=${to} | ${subject}\n${text}\n`);
    return { delivered: false, logged: true };
  }
  await transport.sendMail({ from: process.env.SMTP_FROM || 'no-reply@disability-ims.rw', to, subject, text });
  return { delivered: true };
}

export const sendCredentials = ({ to, name, code, tempPassword }) => send({
  to,
  subject: 'Your Disability Support account / Konti yawe',
  text: [
    `Muraho ${name},`,
    '',
    `Your beneficiary record ${code} has been registered.`,
    `Umwirondoro wawe ${code} wanditswe.`,
    '',
    `Email: ${to}`,
    `Temporary password / Ijambobanga ry'agateganyo: ${tempPassword}`,
    '',
    'Please sign in and change this password. / Nyamuneka injira uhindure iri jambobanga.',
  ].join('\n'),
});

export const sendResetToken = ({ to, token }) => send({
  to,
  subject: 'Password reset / Guhindura ijambobanga',
  text: `Use this code to reset your password (valid 1 hour):\n${token}\n\nKoresha iyi kode guhindura ijambobanga (imara isaha 1).`,
});

export const sendOpportunity = ({ to, title, org }) => send({
  to, subject: `New opportunity: ${title}`,
  text: `A new opportunity has been published for you.\n\n${title}\nBy: ${org}\n\nSign in to see the details.`,
});
