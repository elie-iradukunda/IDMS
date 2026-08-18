// ─────────────────────────────────────────────────────────────
// test_all_15_notifications.mjs
// Full Comprehensive Test of all 15 system notification templates
// across all real users via Brevo API.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import {
  verifyMailer,
  sendCredentials,
  sendResetToken,
  sendOpportunity,
  sendOpportunityOpen,
  sendApplicationReceived,
  sendApplicationDecision,
  sendRequestCreated,
  sendDecision,
  sendDistributing,
  sendCompleted,
  sendCorrectionResolved,
  sendCorrectionFiled,
  sendOfferFiled,
  sendStaffAccount,
  sendAccountDeactivated,
} from './src/services/notify.js';

const USERS = {
  admin: { name: 'Elie Iradukunda (Admin)', email: 'iradukundaelie71@gmail.com' },
  officer: { name: 'NZEYIMANA Vicent', email: 'nzeyimanavicent1@gmail.com' },
  beneficiary1: { name: 'Elie Iradukunda', email: 'elieiradukunda2030@gmail.com', code: 'B-1001' },
  provider: { name: 'kami (Kami Support NGO)', email: 'kamikazi20009@gmail.com' },
  beneficiary2: { name: 'UWINEZA Josianne', email: 'uwinezajosianne04@gmail.com', code: 'B-1005' },
};

async function testAllNotifications() {
  console.log('================================================================');
  console.log('🧪 COMPREHENSIVE TEST: ALL 15 EMAIL NOTIFICATIONS IN THE SYSTEM');
  console.log('================================================================\n');

  // Verify connection
  const v = await verifyMailer();
  if (!v.ready) {
    console.error('❌ Brevo connection failed:', v);
    process.exit(1);
  }

  const tests = [
    // ── 1. BENEFICIARY: Credentials on registration ──
    {
      name: '1. Beneficiary Account Credentials',
      role: 'Beneficiary',
      to: USERS.beneficiary1.email,
      fn: () => sendCredentials({
        to: USERS.beneficiary1.email,
        name: USERS.beneficiary1.name,
        code: USERS.beneficiary1.code,
        tempPassword: 'TempPass' + Math.floor(1000 + Math.random() * 9000),
      }),
    },
    // ── 2. BENEFICIARY: Support Request Created ──
    {
      name: '2. Support Request Created Alert',
      role: 'Beneficiary',
      to: USERS.beneficiary1.email,
      fn: () => sendRequestCreated({
        to: USERS.beneficiary1.email,
        code: 'R-501',
        need: "Inkoni y'abatabona (white cane)",
        byRole: 'OFFICER',
      }),
    },
    // ── 3. BENEFICIARY: Support Request Approved (Urgent) ──
    {
      name: '3. Support Request Decision (Approved - Urgent)',
      role: 'Beneficiary',
      to: USERS.beneficiary1.email,
      fn: () => sendDecision({
        to: USERS.beneficiary1.email,
        code: 'R-501',
        need: "Akagare k'abamugaye (wheelchair)",
        decision: 'urgent',
        reason: 'Uburemere bukabije bw\'ukugenda; byihutirwa mu buvuzi.',
      }),
    },
    // ── 4. BENEFICIARY: Support Distribution Started ──
    {
      name: '4. Support Distribution Started',
      role: 'Beneficiary',
      to: USERS.beneficiary1.email,
      fn: () => sendDistributing({
        to: USERS.beneficiary1.email,
        code: 'R-501',
        need: "Akagare k'abamugaye (wheelchair)",
        provider: 'Kami Support NGO',
      }),
    },
    // ── 5. BENEFICIARY: Support Completed & Delivered ──
    {
      name: '5. Support Delivery Confirmed',
      role: 'Beneficiary',
      to: USERS.beneficiary1.email,
      fn: () => sendCompleted({
        to: USERS.beneficiary1.email,
        code: 'R-501',
        need: "Akagare k'abamugaye (wheelchair)",
      }),
    },
    // ── 6. BENEFICIARY: Correction Request Resolved ──
    {
      name: '6. Correction Request Applied',
      role: 'Beneficiary',
      to: USERS.beneficiary2.email,
      fn: () => sendCorrectionResolved({
        to: USERS.beneficiary2.email,
        applied: true,
        text: 'Gukosora umudugudu n\'umurenge byakozwe n\'umukozi w\'akarere.',
      }),
    },
    // ── 7. BENEFICIARY: New Opportunity Open for Applications ──
    {
      name: '7. New Opportunity Announcement (Apply)',
      role: 'Beneficiary',
      to: USERS.beneficiary2.email,
      fn: () => sendOpportunityOpen({
        to: USERS.beneficiary2.email,
        kind: 'scholarship',
        title: 'Bursary y\'abanyeshuri bafite ubumuga 2026',
        org: 'NCPD',
        detail: 'Buruse yuzuye ku mashuri y\'imyuga harimo n\'ibikoresho by\'ubufasha.',
        deadline: '2026-09-30',
        slots: 15,
      }),
    },
    // ── 8. BENEFICIARY: Application Decision (Accepted) ──
    {
      name: '8. Opportunity Application Decision (Accepted)',
      role: 'Beneficiary',
      to: USERS.beneficiary2.email,
      fn: () => sendApplicationDecision({
        to: USERS.beneficiary2.email,
        name: USERS.beneficiary2.name,
        title: 'Bursary y\'abanyeshuri bafite ubumuga 2026',
        kind: 'scholarship',
        status: 'ACCEPTED',
        reason: 'Wemerewe buruse; uzahabwa amakuru y\'amatariki yo gutangira.',
        org: 'NCPD',
      }),
    },
    // ── 9. OFFICER: Correction Filed Alert ──
    {
      name: '9. Officer Alert: Beneficiary Filed Correction',
      role: 'Officer',
      to: USERS.officer.email,
      fn: () => sendCorrectionFiled({
        to: USERS.officer.email,
        officerName: USERS.officer.name,
        beneficiary: USERS.beneficiary1.name,
        code: USERS.beneficiary1.code,
        text: 'Amazina n\'itariki y\'amavuko byanditse nabi mu nyandiko ya mbere.',
      }),
    },
    // ── 10. OFFICER: Provider Support Offer Filed ──
    {
      name: '10. Officer Alert: Provider Offered Support',
      role: 'Officer',
      to: USERS.officer.email,
      fn: () => sendOfferFiled({
        to: USERS.officer.email,
        code: 'R-503',
        need: "Inkoni y'abatabona",
        provider: 'Kami Support NGO',
        beneficiaryCode: USERS.beneficiary1.code,
      }),
    },
    // ── 11. PROVIDER: Application Received ──
    {
      name: '11. Provider Alert: Candidate Applied to Posting',
      role: 'Provider',
      to: USERS.provider.email,
      fn: () => sendApplicationReceived({
        to: USERS.provider.email,
        title: 'Amahugurwa y\'ikoranabuhanga n\'imyuga',
        kind: 'training',
        beneficiary: USERS.beneficiary2.name,
        code: USERS.beneficiary2.code,
        sector: 'Nyarubaka',
        note: 'Niteguye kwitabira no gukurikira amahugurwa.',
      }),
    },
    // ── 12. PROVIDER / STAFF: Staff Account Created ──
    {
      name: '12. Staff Account Created (Provider/Officer)',
      role: 'Provider',
      to: USERS.provider.email,
      fn: () => sendStaffAccount({
        to: USERS.provider.email,
        name: USERS.provider.name,
        role: 'PROVIDER',
        tempPassword: 'StaffPass' + Math.floor(1000 + Math.random() * 9000),
      }),
    },
    // ── 13. ADMIN / USER: Password Reset Token ──
    {
      name: '13. Password Reset Security Code',
      role: 'Admin',
      to: USERS.admin.email,
      fn: () => sendResetToken({
        to: USERS.admin.email,
        token: String(Math.floor(100000 + Math.random() * 900000)),
      }),
    },
    // ── 14. ADMIN: Staff Account Created ──
    {
      name: '14. Admin Notification: Staff Account Setup',
      role: 'Admin',
      to: USERS.admin.email,
      fn: () => sendStaffAccount({
        to: USERS.admin.email,
        name: USERS.admin.name,
        role: 'ADMIN',
        tempPassword: 'AdminPass' + Math.floor(1000 + Math.random() * 9000),
      }),
    },
    // ── 15. ANY USER: Account Deactivated Notice ──
    {
      name: '15. Account Deactivated Notice',
      role: 'Admin',
      to: USERS.admin.email,
      fn: () => sendAccountDeactivated({
        to: USERS.admin.email,
        name: USERS.admin.name,
      }),
    },
  ];

  const results = [];
  for (const t of tests) {
    process.stdout.write(`Sending "${t.name}" to ${t.to}... `);
    try {
      const res = await t.fn();
      if (res.delivered) {
        console.log(`✅ OK (${res.messageId})`);
        results.push({ name: t.name, role: t.role, to: t.to, status: '✅ DELIVERED', id: res.messageId });
      } else {
        console.log(`❌ FAILED (${res.error})`);
        results.push({ name: t.name, role: t.role, to: t.to, status: '❌ FAILED', id: res.error });
      }
    } catch (e) {
      console.log(`❌ ERROR (${e.message})`);
      results.push({ name: t.name, role: t.role, to: t.to, status: '❌ ERROR', id: e.message });
    }
  }

  console.log('\n================================================================');
  console.log('📊 SUMMARY TABLE OF ALL 15 NOTIFICATION FLOWS');
  console.log('================================================================');
  console.table(results);

  const passed = results.filter(r => r.status === '✅ DELIVERED').length;
  console.log(`\n🎯 TOTAL RESULT: ${passed} / ${tests.length} Notifications Sent & Delivered Successfully!`);
}

testAllNotifications().catch(console.error);
