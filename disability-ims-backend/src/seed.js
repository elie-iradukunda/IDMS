// Seed the demo data used by the frontend. Run: npm run seed
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {
  sequelize, User, Provider, Beneficiary, Impairment, SupportRequest,
  RequestEvent, Correction, Opportunity, Notification, AuditLog, Counter,
} from './models/index.js';

const DAY = 864e5;
const ago = (d) => new Date(Date.now() - d * DAY);

async function main() {
  await sequelize.sync({ force: true }); // drops & recreates — seed only
  const pw = await bcrypt.hash('password123', 10);

  const ngo = await Provider.create({ name: 'Inclusive Hands NGO', type: 'NGO', contact: 'provider@ngo.rw' });

  const B = {};
  const mk = async (code, data, impairments) => {
    const b = await Beneficiary.create({ code, verified: true, consentGiven: true, consentAt: ago(30), ...data });
    for (const im of impairments) await Impairment.create({ beneficiaryId: b.id, ...im });
    B[code] = b; return b;
  };
  await mk('B-1001', { fullName: 'Mukamana Alice', nationalId: '1198870...4021', sector: 'Runda', cell: 'Kabuga', village: 'Nyakabungo', email: 'alice@beneficiary.rw',
    dailyChallenges: "Ntashobora gusoma inyandiko; akeneye uwamuyobora mu nzira nshya.", supportNeeds: "Inkoni y'abatabona (white cane) n'amahugurwa yo kugenda." },
    [{ type: 'seeing', level: 'alot' }]);
  await mk('B-1002', { fullName: 'Habimana Jean', nationalId: '1199180...7714', sector: 'Musambira', cell: 'Kigusa', village: 'Karambo', guardianName: 'Habimana Marie (nyina)',
    dailyChallenges: 'Ntashobora kugenda; akoresha inkoni ariko birananira ku ntera ndende.', supportNeeds: "Akagare k'abamugaye (wheelchair)." },
    [{ type: 'walking', level: 'cannot' }]);
  await mk('B-1003', { fullName: 'Uwase Claudine', nationalId: '1200070...1188', sector: 'Gacurabwenge', cell: 'Ntenyo', village: 'Buhoro', verified: false,
    dailyChallenges: 'Ntumva neza; bigora kumva amabwiriza mu materaniro.', supportNeeds: 'Igikoresho cyo kumva (hearing aid).' },
    [{ type: 'hearing', level: 'alot' }]);
  await mk('B-1004', { fullName: 'Nsengimana Eric', nationalId: '1199560...9903', sector: 'Runda', cell: 'Kabuga', village: 'Gitega',
    dailyChallenges: "Aribagirwa vuba; akeneye ubufasha mu kwiga umwuga.", supportNeeds: "Amahugurwa y'umwuga (vocational training)." },
    [{ type: 'cognition', level: 'some' }]);

  const officer = await User.create({ fullName: 'Officer Uwimana', email: 'officer@kamonyi.gov.rw', role: 'OFFICER', sector: 'Kamonyi', passwordHash: pw });
  await User.create({ fullName: 'Mukamana Alice', email: 'alice@beneficiary.rw', role: 'BENEFICIARY', beneficiaryId: B['B-1001'].id, passwordHash: pw });
  await User.create({ fullName: 'Inclusive Hands NGO', email: 'provider@ngo.rw', role: 'PROVIDER', providerId: ngo.id, passwordHash: pw });
  await User.create({ fullName: 'System Admin', email: 'admin@disability.gov.rw', role: 'ADMIN', passwordHash: pw });

  const req = async (code, benCode, need, origin, status, reason, events, extra = {}) => {
    const r = await SupportRequest.create({ code, beneficiaryId: B[benCode].id, need, origin, status, decisionReason: reason,
      providerId: origin === 'PROVIDER' ? ngo.id : null, decidedById: reason ? officer.id : null, ...extra });
    for (const e of events) await RequestEvent.create({ requestId: r.id, label: e });
    return r;
  };
  await req('R-501', 'B-1002', "Akagare k'abamugaye (wheelchair)", 'OFFICER', 'APPROVED_URGENT', "Uburemere bukabije bw'ukugenda; byihutirwa.",
    ['Requested by officer', 'Approved — urgent, escalated for priority support (reason recorded)']);
  await req('R-502', 'B-1004', "Amahugurwa y'umwuga", 'PROVIDER', 'DISTRIBUTING', 'Uwunguka arujuje ibisabwa; ahujwe na cooperative.',
    ['Provider submitted a support offer', 'Approved — standard (reason recorded)', 'Distribution started with the provider']);
  await req('R-503', 'B-1001', "Inkoni y'abatabona (white cane)", 'PROVIDER', 'REQUESTED', null, ['Provider submitted a support offer']);
  await req('R-504', 'B-1003', 'Igikoresho cyo kumva', 'OFFICER', 'COMPLETED', 'Byatanzwe kandi byakiriwe.',
    ['Requested by officer', 'Approved — standard (reason recorded)', 'Delivery confirmed — support history stored'],
    { completedAt: ago(20), createdAt: ago(30) });
  await req('R-505', 'B-1001', 'Monthly transport stipend', 'OFFICER', 'INELIGIBLE', 'Existing family support covers this transport need for now.',
    ['Requested by officer', 'Recorded as not eligible — beneficiary notified with the reason']);

  await Correction.create({ beneficiaryId: B['B-1001'].id, text: 'Villaji yanjye si Nyakabungo, ni Gasharu.' });

  await Opportunity.bulkCreate([
    { kind: 'scholarship', title: "Bursary y'abanyeshuri bafite ubumuga", org: 'NCPD', detail: "Buruse yuzuye ku mashuri y'imyuga." },
    { kind: 'job', title: 'Akazi ka reception (accessible office)', org: 'Kamonyi District', detail: 'Umwanya ubereye abafite ubumuga bwo kugenda.' },
    { kind: 'training', title: "Amahugurwa y'ikoranabuhanga", org: 'Inclusive Tech Rwanda', detail: 'Amahugurwa y\'ibanze kuri mudasobwa, arimo screen readers.' },
    { kind: 'announcement', title: 'District assistive-device assessment day', org: 'NCPD', detail: 'Assessment team visits Runda sector office on Friday for new and replacement devices.' },
  ]);
  await Notification.bulkCreate([
    { beneficiaryId: B['B-1001'].id, icon: '🦯', message: 'A support offer (white cane) was submitted — under review.' },
    { beneficiaryId: B['B-1001'].id, icon: '🎓', message: 'New scholarship published — see Opportunities.' },
  ]);
  await AuditLog.bulkCreate([
    { actorName: 'Officer Uwimana', action: 'Registered beneficiary B-1004 (Nsengimana Eric)', entity: 'Beneficiary' },
    { actorName: 'Officer Uwimana', action: 'Decided R-501 → APPROVED_URGENT', entity: 'SupportRequest' },
    { actorName: 'System', action: 'Credentials emailed for B-1001', entity: 'Beneficiary' },
  ]);
  await Counter.bulkCreate([{ key: 'beneficiary', value: 1004 }, { key: 'request', value: 504 }]);

  console.log('Seed complete. Password for all demo accounts: password123');
  console.log('  officer@kamonyi.gov.rw · alice@beneficiary.rw · provider@ngo.rw · admin@disability.gov.rw');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => sequelize.close());
