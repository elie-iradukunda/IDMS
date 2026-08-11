// ─────────────────────────────────────────────────────────────
// seed.js — demo data. Run: npm run seed
//
// The dataset is not decorative. It is built to exercise every table,
// every enum branch and every screen with realistic content, and to
// contain the boundary conditions named in Section 3.9.1, which a naive
// implementation typically fails:
//   · a beneficiary with multiple impairments      → B-1005
//   · a beneficiary with no email address          → B-1002, B-1006
//   · a guardian acting for several beneficiaries  → B-1002 & B-1006
//   · a duplicate registration attempt             → B-1007 (same sector+name shape)
//   · a beneficiary who has since died             → B-1008 (DECEASED)
//   · an archived record                           → B-1009 (ARCHIVED)
//   · a deactivated login                          → the retired officer
// Every support-request status and every correction status appears at
// least once, so no dashboard renders an empty branch.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {
  sequelize, User, Provider, Beneficiary, Impairment, SupportRequest,
  RequestEvent, Correction, Opportunity, OpportunityApplication,
  Notification, AuditLog, Counter,
} from './models/index.js';

const DAY = 864e5;
const ago = (d) => new Date(Date.now() - d * DAY);
// Closing dates are seeded relative to today so the demo data never ages into
// a state where every opportunity is shut and nothing can be applied to.
const inDays = (d) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);

async function main() {
  await sequelize.sync({ force: true }); // drops & recreates — seed only
  const pw = await bcrypt.hash('password123', 10);

  // ── Provider organisations ─────────────────────────────────
  const ngo = await Provider.create({ name: 'Inclusive Hands NGO', type: 'NGO', contact: 'provider@ngo.rw' });
  const coop = await Provider.create({ name: 'Kamonyi Artisans Cooperative', type: 'Cooperative', contact: 'coop@kamonyi.rw' });
  const donor = await Provider.create({ name: 'Rwanda Assistive Devices Fund', type: 'Donor', contact: 'fund@radf.rw' });

  // ── Beneficiaries ──────────────────────────────────────────
  const B = {};
  const mk = async (code, data, impairments) => {
    const b = await Beneficiary.create({ code, verified: true, consentGiven: true, consentAt: ago(30), ...data });
    for (const im of impairments) await Impairment.create({ beneficiaryId: b.id, ...im });
    B[code] = b;
    return b;
  };

  await mk('B-1001', {
    fullName: 'Mukamana Alice', nationalId: '1198870...4021', sector: 'Runda', cell: 'Kabuga', village: 'Nyakabungo',
    email: 'alice@beneficiary.rw', createdAt: ago(45),
    dailyChallenges: 'Ntashobora gusoma inyandiko; akeneye uwamuyobora mu nzira nshya.',
    supportNeeds: "Inkoni y'abatabona (white cane) n'amahugurwa yo kugenda.",
  }, [{ type: 'seeing', level: 'alot' }]);

  // No email — guardian/officer-mediated access is a first-class path.
  await mk('B-1002', {
    fullName: 'Habimana Jean', nationalId: '1199180...7714', sector: 'Musambira', cell: 'Kigusa', village: 'Karambo',
    guardianName: 'Habimana Marie (nyina)', createdAt: ago(40),
    dailyChallenges: 'Ntashobora kugenda; akoresha inkoni ariko birananira ku ntera ndende.',
    supportNeeds: "Akagare k'abamugaye (wheelchair).",
  }, [{ type: 'walking', level: 'cannot' }]);

  // Unverified: registered but not yet confirmed by an officer visit.
  await mk('B-1003', {
    fullName: 'Uwase Claudine', nationalId: '1200070...1188', sector: 'Gacurabwenge', cell: 'Ntenyo', village: 'Buhoro',
    verified: false, email: 'claudine@beneficiary.rw', createdAt: ago(35),
    dailyChallenges: 'Ntumva neza; bigora kumva amabwiriza mu materaniro.',
    supportNeeds: 'Igikoresho cyo kumva (hearing aid).',
  }, [{ type: 'hearing', level: 'alot' }]);

  await mk('B-1004', {
    fullName: 'Nsengimana Eric', nationalId: '1199560...9903', sector: 'Runda', cell: 'Kabuga', village: 'Gitega',
    email: 'eric@beneficiary.rw', createdAt: ago(28),
    dailyChallenges: 'Aribagirwa vuba; akeneye ubufasha mu kwiga umwuga.',
    supportNeeds: "Amahugurwa y'umwuga (vocational training).",
  }, [{ type: 'cognition', level: 'some' }]);

  // Multiple impairments — the record must describe a person, not a category.
  await mk('B-1005', {
    fullName: 'Nyirahabimana Josiane', nationalId: '1198340...5567', sector: 'Nyarubaka', cell: 'Mataba', village: 'Rugarama',
    email: 'josiane@beneficiary.rw', createdAt: ago(22),
    dailyChallenges: 'Ntabona neza kandi ntumva neza; ntashobora kwiyitaho wenyine mu gitondo.',
    supportNeeds: 'Ubufasha bwo kwitaho bwa buri munsi, hamwe n\'igikoresho cyo kumva.',
  }, [
    { type: 'seeing', level: 'some' },
    { type: 'hearing', level: 'cannot' },
    { type: 'selfcare', level: 'alot' },
  ]);

  // Same guardian as B-1002 — one guardian acting for several beneficiaries.
  await mk('B-1006', {
    fullName: 'Habimana Olivier', nationalId: '1200910...3345', sector: 'Musambira', cell: 'Kigusa', village: 'Karambo',
    guardianName: 'Habimana Marie (nyina)', createdAt: ago(18),
    dailyChallenges: 'Ntavuga; akoresha amarenga gusa mu kuvugana n\'abandi.',
    supportNeeds: 'Amahugurwa y\'ururimi rw\'amarenga ku muryango we.',
  }, [{ type: 'communication', level: 'cannot' }]);

  // Near-duplicate of B-1001 by name+sector: the duplication metric and the
  // officer's duplicate warning both need a real case to detect.
  await mk('B-1007', {
    fullName: 'Mukamana Alice', nationalId: '1198870...9982', sector: 'Runda', cell: 'Kabuga', village: 'Gasharu',
    createdAt: ago(12),
    dailyChallenges: 'Ingorane zo kubona mu ijoro.',
    supportNeeds: 'Isuzuma ry\'amaso.',
  }, [{ type: 'seeing', level: 'some' }]);

  // Handled with dignity rather than with an error.
  await mk('B-1008', {
    fullName: 'Bizimana Théoneste', nationalId: '1194420...6610', sector: 'Gacurabwenge', cell: 'Ntenyo', village: 'Kabuye',
    status: 'DECEASED', createdAt: ago(120),
    dailyChallenges: 'Ingorane zo kugenda no kwitaho.',
    supportNeeds: 'Ubufasha bwo mu rugo.',
  }, [{ type: 'walking', level: 'cannot' }, { type: 'selfcare', level: 'alot' }]);

  // Archived: removed from active coordination, support history intact.
  await mk('B-1009', {
    fullName: 'Ingabire Sandrine', nationalId: '1199990...2201', sector: 'Nyarubaka', cell: 'Mataba', village: 'Kavumu',
    status: 'ARCHIVED', createdAt: ago(90),
    dailyChallenges: 'Yimukiye mu kandi karere.',
    supportNeeds: 'Yakuwe ku rutonde rw\'ubufasha bw\'ako karere.',
  }, [{ type: 'cognition', level: 'some' }]);

  // ── Users ──────────────────────────────────────────────────
  // A district-wide officer has no sector, which is how the rest of the system
  // spells it (the user admin offers "District-wide" as the empty option, and
  // correction routing falls through to any active officer). Putting the
  // district's own name in the sector column made this officer scoped to a
  // sector that does not exist, so every sector-filtered count read zero.
  const officer = await User.create({ fullName: 'Officer Uwimana', email: 'officer@kamonyi.gov.rw', role: 'OFFICER', sector: null, passwordHash: pw });
  const officer2 = await User.create({ fullName: 'Officer Mukandayisenga', email: 'officer2@kamonyi.gov.rw', role: 'OFFICER', sector: 'Musambira', passwordHash: pw });
  // A deactivated account: status ENUM needs a real case, and login must refuse it.
  await User.create({ fullName: 'Officer Ndayisaba (retired)', email: 'officer.retired@kamonyi.gov.rw', role: 'OFFICER', sector: 'Runda', status: 'INACTIVE', passwordHash: pw });

  const aliceUser = await User.create({ fullName: 'Mukamana Alice', email: 'alice@beneficiary.rw', role: 'BENEFICIARY', beneficiaryId: B['B-1001'].id, passwordHash: pw });
  await User.create({ fullName: 'Uwase Claudine', email: 'claudine@beneficiary.rw', role: 'BENEFICIARY', beneficiaryId: B['B-1003'].id, passwordHash: pw });
  await User.create({ fullName: 'Nsengimana Eric', email: 'eric@beneficiary.rw', role: 'BENEFICIARY', beneficiaryId: B['B-1004'].id, passwordHash: pw });
  const josianeUser = await User.create({ fullName: 'Nyirahabimana Josiane', email: 'josiane@beneficiary.rw', role: 'BENEFICIARY', beneficiaryId: B['B-1005'].id, passwordHash: pw });

  const provider = await User.create({ fullName: 'Inclusive Hands NGO', email: 'provider@ngo.rw', role: 'PROVIDER', providerId: ngo.id, passwordHash: pw });
  await User.create({ fullName: 'Kamonyi Artisans Cooperative', email: 'coop@kamonyi.rw', role: 'PROVIDER', providerId: coop.id, passwordHash: pw });
  await User.create({ fullName: 'System Admin', email: 'admin@disability.gov.rw', role: 'ADMIN', passwordHash: pw });

  // Every beneficiary record carries the officer who registered it, so a
  // correction request has a real person to route to.
  await Beneficiary.update({ registeredById: officer.id }, { where: { sector: ['Runda', 'Gacurabwenge', 'Nyarubaka'] } });
  await Beneficiary.update({ registeredById: officer2.id }, { where: { sector: 'Musambira' } });

  // ── Support requests: every status, every origin ───────────
  const req = async (code, benCode, need, origin, status, reason, events, extra = {}) => {
    const r = await SupportRequest.create({
      code, beneficiaryId: B[benCode].id, need, origin, status, decisionReason: reason,
      providerId: extra.providerId ?? (origin === 'PROVIDER' ? ngo.id : null),
      decidedById: reason ? officer.id : null, ...extra,
    });
    for (const [i, e] of events.entries()) {
      await RequestEvent.create({ requestId: r.id, label: e, createdAt: extra.createdAt ? new Date(+extra.createdAt + i * 36e5) : undefined });
    }
    return r;
  };

  await req('R-501', 'B-1002', "Akagare k'abamugaye (wheelchair)", 'OFFICER', 'APPROVED_URGENT',
    "Uburemere bukabije bw'ukugenda; byihutirwa.",
    ['Requested by officer', 'Approved — urgent, escalated for priority support (reason recorded)'],
    { createdAt: ago(9) });

  await req('R-502', 'B-1004', "Amahugurwa y'umwuga", 'PROVIDER', 'DISTRIBUTING',
    'Uwunguka arujuje ibisabwa; ahujwe na cooperative.',
    ['Provider submitted a support offer', 'Approved — queued for scheduled distribution (reason recorded)', 'Distribution started with the provider'],
    { createdAt: ago(14), providerId: coop.id });

  await req('R-503', 'B-1001', "Inkoni y'abatabona (white cane)", 'PROVIDER', 'REQUESTED', null,
    ['Provider submitted a support offer'], { createdAt: ago(3) });

  await req('R-504', 'B-1003', 'Igikoresho cyo kumva', 'OFFICER', 'COMPLETED',
    'Byatanzwe kandi byakiriwe.',
    ['Requested by officer', 'Approved — queued for scheduled distribution (reason recorded)', 'Distribution started with the provider', 'Delivery confirmed — support history stored'],
    { completedAt: ago(20), createdAt: ago(30), providerId: donor.id });

  await req('R-505', 'B-1001', 'Monthly transport stipend', 'OFFICER', 'INELIGIBLE',
    'Existing family support covers this transport need for now.',
    ['Requested by officer', 'Recorded as not eligible — beneficiary notified with the reason'],
    { createdAt: ago(25) });

  // Beneficiary-initiated: the person asks for what they need themselves.
  await req('R-506', 'B-1005', "Igikoresho cyo kumva (hearing aid)", 'BENEFICIARY', 'REQUESTED', null,
    ['Requested by the beneficiary'], { createdAt: ago(2) });

  await req('R-507', 'B-1005', 'Ubufasha bwo kwitaho bwa buri munsi', 'BENEFICIARY', 'APPROVED_STANDARD',
    'Isuzuma ryemeje ko akeneye ubufasha bwa buri munsi; yashyizwe ku rutonde.',
    ['Requested by the beneficiary', 'Approved — queued for scheduled distribution (reason recorded)'],
    { createdAt: ago(11) });

  await req('R-508', 'B-1006', "Amahugurwa y'ururimi rw'amarenga", 'OFFICER', 'COMPLETED',
    "Umuryango wahawe amahugurwa y'ururimi rw'amarenga.",
    ['Requested by officer', 'Approved — queued for scheduled distribution (reason recorded)', 'Distribution started with the provider', 'Delivery confirmed — support history stored'],
    { createdAt: ago(60), completedAt: ago(41), providerId: ngo.id });

  await req('R-509', 'B-1007', "Isuzuma ry'amaso", 'PROVIDER', 'CANCELLED', null,
    ['Provider submitted a support offer', 'Request cancelled'],
    { createdAt: ago(6), providerId: donor.id });

  await req('R-510', 'B-1008', 'Ubufasha bwo mu rugo', 'OFFICER', 'COMPLETED',
    'Byatanzwe mbere y\'uko atabaruka.',
    ['Requested by officer', 'Approved — urgent, escalated for priority support (reason recorded)', 'Delivery confirmed — support history stored'],
    { createdAt: ago(150), completedAt: ago(130) });

  // ── Corrections: every status ──────────────────────────────
  await Correction.create({ beneficiaryId: B['B-1001'].id, text: 'Villaji yanjye si Nyakabungo, ni Gasharu.', createdAt: ago(2) });
  await Correction.create({ beneficiaryId: B['B-1005'].id, text: "Izina ryanjye ryanditswe nabi: ni Josiane, si Josiyane.", createdAt: ago(1) });
  await Correction.create({ beneficiaryId: B['B-1003'].id, text: 'Nahinduye nimero ya telefone.', status: 'APPLIED', handledById: officer.id, createdAt: ago(15) });
  await Correction.create({ beneficiaryId: B['B-1004'].id, text: 'Nsaba guhindurirwa umurenge.', status: 'DECLINED', handledById: officer.id, createdAt: ago(20) });

  // ── Opportunities (every kind) ─────────────────────────────
  // The three real opportunities are open for applications and carry a
  // closing date and a number of places; the announcement is information only,
  // so it has nothing to apply to.
  const [bursary, job, training] = await Opportunity.bulkCreate([
    { kind: 'scholarship', title: "Bursary y'abanyeshuri bafite ubumuga", org: 'NCPD', postedById: officer.id, createdAt: ago(5), deadline: inDays(21), slots: 15, acceptsApplications: true, detail: "Buruse yuzuye ku mashuri y'imyuga, harimo n'ibikoresho by'ubufasha." },
    { kind: 'job', title: 'Akazi ka reception (accessible office)', org: 'Kamonyi District', postedById: officer.id, createdAt: ago(8), deadline: inDays(10), slots: 2, acceptsApplications: true, detail: 'Umwanya ubereye abafite ubumuga bwo kugenda; ibiro biri hasi kandi byoroshye kugerwaho.' },
    { kind: 'training', title: "Amahugurwa y'ikoranabuhanga", org: 'Inclusive Tech Rwanda', postedById: provider.id, createdAt: ago(12), deadline: inDays(30), slots: 25, acceptsApplications: true, detail: "Amahugurwa y'ibanze kuri mudasobwa, arimo screen readers ku batabona." },
    { kind: 'announcement', title: 'District assistive-device assessment day', org: 'NCPD', postedById: officer.id, createdAt: ago(1), acceptsApplications: false, detail: 'Assessment team visits Runda sector office on Friday for new and replacement devices.' },
  ], { returning: true });

  // ── Applications: every status, and both origins ───────────
  // B-1002 is the case the officer-mediated path exists for: no email on file,
  // so a self-service-only system would never have reached him at all.
  await OpportunityApplication.bulkCreate([
    { opportunityId: bursary.id, beneficiaryId: B['B-1001'].id, origin: 'BENEFICIARY', submittedById: aliceUser.id, status: 'SUBMITTED', createdAt: ago(4), note: "Ndashaka gukomeza amashuri y'imyuga ariko sinshobora kwishyura." },
    { opportunityId: bursary.id, beneficiaryId: B['B-1002'].id, origin: 'OFFICER', submittedById: officer.id, status: 'SHORTLISTED', createdAt: ago(4), decisionReason: 'Meets the criteria; invited to the district interview on the 12th.', decidedById: officer.id, decidedAt: ago(2), note: 'Applied at the sector office — no email or device at home.' },
    { opportunityId: bursary.id, beneficiaryId: B['B-1005'].id, origin: 'BENEFICIARY', submittedById: josianeUser?.id || null, status: 'ACCEPTED', createdAt: ago(5), decisionReason: 'Awarded one of the 15 places; the bursary covers fees and an assistive device.', decidedById: officer.id, decidedAt: ago(1) },
    { opportunityId: job.id, beneficiaryId: B['B-1001'].id, origin: 'BENEFICIARY', submittedById: aliceUser.id, status: 'DECLINED', createdAt: ago(7), decisionReason: 'The role requires on-screen data entry that the workplace cannot yet adapt; a training place has been suggested instead.', decidedById: officer.id, decidedAt: ago(3) },
    { opportunityId: training.id, beneficiaryId: B['B-1004'].id, origin: 'OFFICER', submittedById: officer2.id, status: 'SUBMITTED', createdAt: ago(2), note: 'Applied on his behalf during a home visit.' },
    { opportunityId: training.id, beneficiaryId: B['B-1003'].id, origin: 'BENEFICIARY', submittedById: null, status: 'WITHDRAWN', createdAt: ago(6) },
  ]);

  // ── Notifications (read and unread) ────────────────────────
  await Notification.bulkCreate([
    { beneficiaryId: B['B-1001'].id, icon: '🦯', message: 'A support offer (white cane) was submitted — under review.', createdAt: ago(3) },
    { beneficiaryId: B['B-1001'].id, icon: '🎓', message: "New scholarship: Bursary y'abanyeshuri bafite ubumuga", createdAt: ago(5) },
    { beneficiaryId: B['B-1001'].id, icon: 'ℹ️', message: 'Support request not approved. Reason: Existing family support covers this transport need for now.', read: true, createdAt: ago(25) },
    { beneficiaryId: B['B-1003'].id, icon: '🎉', message: 'Your support has been delivered and recorded.', read: true, createdAt: ago(20) },
    { beneficiaryId: B['B-1003'].id, icon: '✏️', message: 'Your correction was applied to your record.', createdAt: ago(15) },
    { beneficiaryId: B['B-1004'].id, icon: '📦', message: 'Your support is being distributed.', createdAt: ago(10) },
    { beneficiaryId: B['B-1005'].id, icon: '🤝', message: 'Your support request was submitted and is under review.', createdAt: ago(2) },
    { beneficiaryId: B['B-1005'].id, icon: '✅', message: 'Your support request was approved.', createdAt: ago(11) },
    { beneficiaryId: B['B-1005'].id, icon: '📣', message: 'New announcement: District assistive-device assessment day', createdAt: ago(1) },
  ]);

  // ── Audit log ──────────────────────────────────────────────
  await AuditLog.bulkCreate([
    { actorId: officer.id, actorName: 'Officer Uwimana', action: 'Registered beneficiary B-1005 (Nyirahabimana Josiane)', entity: 'Beneficiary:5', createdAt: ago(22) },
    { actorId: officer.id, actorName: 'Officer Uwimana', action: 'Decided R-501 → APPROVED_URGENT', entity: 'SupportRequest:1', createdAt: ago(9) },
    { actorId: officer.id, actorName: 'Officer Uwimana', action: 'Decided R-507 → APPROVED_STANDARD', entity: 'SupportRequest:7', createdAt: ago(11) },
    { actorId: officer.id, actorName: 'Officer Uwimana', action: 'Started distribution R-502', entity: 'SupportRequest:2', createdAt: ago(13) },
    { actorId: officer.id, actorName: 'Officer Uwimana', action: 'Completed R-504', entity: 'SupportRequest:4', createdAt: ago(20) },
    { actorId: officer.id, actorName: 'Officer Uwimana', action: 'Correction 3 applied to B-1003', entity: 'Correction:3', createdAt: ago(15) },
    { actorId: officer.id, actorName: 'Officer Uwimana', action: 'Beneficiary B-1008 status → DECEASED', entity: 'Beneficiary:8', createdAt: ago(125) },
    { actorId: officer2.id, actorName: 'Officer Mukandayisenga', action: 'Registered beneficiary B-1006 (Habimana Olivier)', entity: 'Beneficiary:6', createdAt: ago(18) },
    { actorName: 'System', action: 'Credentials emailed for B-1001', entity: 'Beneficiary:1', createdAt: ago(45) },
    { actorName: 'System', action: 'Credentials emailed for B-1005', entity: 'Beneficiary:5', createdAt: ago(22) },
  ]);

  // Counters hold the last-used sequence number so the next code is value + 1.
  // Beneficiaries seeded up to B-1009 and support requests up to R-510.
  await Counter.bulkCreate([{ key: 'beneficiary', value: 1009 }, { key: 'request', value: 510 }]);

  const counts = {
    providers: await Provider.count(), beneficiaries: await Beneficiary.count(),
    impairments: await Impairment.count(), users: await User.count(),
    requests: await SupportRequest.count(), events: await RequestEvent.count(),
    corrections: await Correction.count(), opportunities: await Opportunity.count(),
    applications: await OpportunityApplication.count(),
    notifications: await Notification.count(), auditLog: await AuditLog.count(),
  };
  console.log('Seed complete:', counts);
  console.log('Password for all demo accounts: password123');
  console.log('  officer@kamonyi.gov.rw · alice@beneficiary.rw · provider@ngo.rw · admin@disability.gov.rw');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => sequelize.close());
