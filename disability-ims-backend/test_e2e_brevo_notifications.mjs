// ─────────────────────────────────────────────────────────────
// test_e2e_brevo_notifications.mjs
// End-to-End test of real email notifications sent via Brevo API
// to the seeded users.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import {
  verifyMailer,
  sendCredentials,
  sendResetToken,
  sendDecision,
  sendCorrectionFiled,
  sendOpportunityOpen,
  sendApplicationReceived,
  sendStaffAccount,
  sendCompleted,
} from './src/services/notify.js';

const USERS = {
  admin: { name: 'Elie Iradukunda (Admin)', email: 'iradukundaelie71@gmail.com' },
  officer: { name: 'NZEYIMANA Vicent', email: 'nzeyimanavicent1@gmail.com' },
  beneficiary1: { name: 'Elie Iradukunda', email: 'elieiradukunda2030@gmail.com', code: 'B-1001' },
  provider: { name: 'kami (Kami Support NGO)', email: 'kamikazi20009@gmail.com' },
  beneficiary2: { name: 'UWINEZA Josianne', email: 'uwinezajosianne04@gmail.com', code: 'B-1005' },
};

async function runE2ETests() {
  console.log('============================================================');
  console.log('🚀 Starting End-to-End Brevo Email Notification Test');
  console.log('============================================================\n');

  // 1. Verify Mailer
  console.log('1️⃣ Checking Brevo Mailer Connection...');
  const v = await verifyMailer();
  if (!v.ready) {
    console.error('❌ Mailer verification failed:', v);
    process.exit(1);
  }
  console.log('✅ Brevo Mailer is READY & CONNECTED!\n');

  const results = [];

  // 2. Beneficiary 1 (elieiradukunda2030@gmail.com): Account Credentials & Registration
  console.log(`2️⃣ Testing Beneficiary Registration Mail → ${USERS.beneficiary1.email}...`);
  const r1 = await sendCredentials({
    to: USERS.beneficiary1.email,
    name: USERS.beneficiary1.name,
    code: USERS.beneficiary1.code,
    tempPassword: 'Pass' + Math.floor(100000 + Math.random() * 900000),
  });
  console.log('   Result:', r1);
  results.push({ test: 'Beneficiary Account Credentials', to: USERS.beneficiary1.email, ...r1 });

  // 3. Officer (nzeyimanavicent1@gmail.com): Officer Action Alert (Correction filed)
  console.log(`\n3️⃣ Testing Officer Action Required Alert → ${USERS.officer.email}...`);
  const r2 = await sendCorrectionFiled({
    to: USERS.officer.email,
    officerName: USERS.officer.name,
    beneficiary: USERS.beneficiary1.name,
    code: USERS.beneficiary1.code,
    text: 'Amazina yanjye yanditse nabi mu mudugudu, ndasaba kuyakosora.',
  });
  console.log('   Result:', r2);
  results.push({ test: 'Officer Action Alert', to: USERS.officer.email, ...r2 });

  // 4. Beneficiary 2 (uwinezajosianne04@gmail.com): Support Decision & Distribution
  console.log(`\n4️⃣ Testing Support Approval & Delivery Notification → ${USERS.beneficiary2.email}...`);
  const r3 = await sendDecision({
    to: USERS.beneficiary2.email,
    code: 'R-507',
    need: 'Ubufasha bwo kwitaho bwa buri munsi hamwe n\'igikoresho cyo kumva',
    decision: 'standard',
    reason: 'Isuzuma ryemeje ko akeneye ubufasha bwa buri munsi; yashyizwe ku rutonde.',
  });
  console.log('   Result:', r3);
  results.push({ test: 'Beneficiary Support Decision', to: USERS.beneficiary2.email, ...r3 });

  // 5. Provider (kamikazi20009@gmail.com): New Application Received
  console.log(`\n5️⃣ Testing Provider Notification (Application Received) → ${USERS.provider.email}...`);
  const r4 = await sendApplicationReceived({
    to: USERS.provider.email,
    title: 'Amahugurwa y\'ikoranabuhanga n\'imyuga',
    kind: 'Training',
    beneficiary: USERS.beneficiary2.name,
    code: USERS.beneficiary2.code,
    sector: 'Nyarubaka',
    note: 'Niteguye kwitabira amahugurwa.',
  });
  console.log('   Result:', r4);
  results.push({ test: 'Provider Application Alert', to: USERS.provider.email, ...r4 });

  // 6. Admin (iradukundaelie71@gmail.com): Password Reset & Staff Notice
  console.log(`\n6️⃣ Testing Admin Password Reset Token → ${USERS.admin.email}...`);
  const r5 = await sendResetToken({
    to: USERS.admin.email,
    token: String(Math.floor(100000 + Math.random() * 900000)),
  });
  console.log('   Result:', r5);
  results.push({ test: 'Admin Password Reset', to: USERS.admin.email, ...r5 });

  console.log('\n============================================================');
  console.log('📊 END-TO-END NOTIFICATION TEST SUMMARY');
  console.log('============================================================');
  console.table(results.map(r => ({
    Test: r.test,
    Recipient: r.to,
    Delivered: r.delivered ? '✅ SUCCESS' : '❌ FAILED',
    MessageId: r.messageId || r.error || 'N/A',
  })));

  const allPassed = results.every(r => r.delivered);
  if (allPassed) {
    console.log('🎉 ALL 5 REAL USERS RECEIVED THEIR NOTIFICATIONS SUCCESSFULLY!');
  } else {
    console.log('⚠️ Some notifications encountered issues.');
  }
}

runE2ETests().catch(console.error);
