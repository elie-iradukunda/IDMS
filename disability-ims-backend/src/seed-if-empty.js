// ─────────────────────────────────────────────────────────────
// seed-if-empty.js — first-boot bootstrap for a hosted deployment.
//
// A managed database arrives with no schema at all, so the very first deploy
// comes up healthy and then answers every request with "Table 'Users' doesn't
// exist". Running `npm run seed` by hand is not possible where the database
// has no public proxy — it is only reachable from inside the platform's own
// network, which is exactly where the app container already is.
//
// So this runs as part of the start command. The important property is that
// it is SAFE TO RUN ON EVERY BOOT: seed.js drops every table before it loads
// its demo data, so this wrapper first checks whether there is anything to
// lose and does nothing at all if there is. A restart, a redeploy or a scale
// event must never be able to wipe a district's registry.
// ─────────────────────────────────────────────────────────────
import { sequelize, User } from './models/index.js';

async function isEmpty() {
  try {
    return (await User.count()) === 0;
  } catch {
    // The table does not exist yet — a brand-new database.
    return true;
  }
}

(async () => {
  await sequelize.authenticate();

  // Escape hatch for restoring a demonstration instance to a known state.
  // It is deliberately awkward: it must be spelled out in full, it refuses to
  // act unless the deployment is explicitly marked as a demo, and it announces
  // itself loudly — because what it does is drop every table.
  if (process.env.SEED_FORCE === 'yes-drop-everything' && process.env.DEMO_INSTANCE === 'true') {
    console.warn('[seed-if-empty] SEED_FORCE set on a DEMO_INSTANCE — dropping all data and reloading the demo dataset.');
    await import('./seed.js');
    return;
  }

  if (!(await isEmpty())) {
    const users = await User.count();
    console.log(`[seed-if-empty] ${users} user account(s) already present — leaving the database untouched.`);
    await sequelize.close();
    return;
  }

  console.log('[seed-if-empty] No accounts found — loading the demo dataset.');
  // seed.js runs on import and closes the connection itself.
  await import('./seed.js');
})().catch((e) => {
  // A bootstrap failure must not take the web service down with it: the app
  // can still start, and its own error handling will report the real problem.
  console.error('[seed-if-empty] Skipped:', e.message);
  process.exit(0);
});
