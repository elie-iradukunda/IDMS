// Role metadata, keyed by the backend's UPPERCASE role names.
export const ROLES = {
  OFFICER:     { key: 'officer',     email: 'officer@kamonyi.gov.rw',  color: 'var(--sky-700)', bg: 'var(--sky-soft)',    ico: '🧑‍💼', home: '/officer' },
  BENEFICIARY: { key: 'beneficiary', email: 'alice@beneficiary.rw',    color: 'var(--green)',   bg: 'var(--green-soft)',  ico: '🧑‍🦯', home: '/beneficiary' },
  PROVIDER:    { key: 'provider',    email: 'provider@ngo.rw',         color: 'var(--amber)',   bg: 'var(--amber-soft)',  ico: '🤝',  home: '/provider' },
  ADMIN:       { key: 'admin',       email: 'admin@disability.gov.rw', color: 'var(--violet)',  bg: 'var(--violet-soft)', ico: '🛡️', home: '/admin' },
};

// Demo accounts shown on the login screen (all use password123 after seeding).
export const DEMO_ACCOUNTS = ['OFFICER', 'BENEFICIARY', 'PROVIDER', 'ADMIN'];
export const DEMO_PASSWORD = 'password123';

// One-click sign-in as an administrator is exactly what a demonstration needs
// and exactly what a live district registry must not offer: the cards publish
// a working credential for every role, including the one that can read the
// whole registry. They appear in development, and in a deployed build only if
// the operator opts in explicitly with VITE_SHOW_DEMO_ACCOUNTS=true.
export const SHOW_DEMO_ACCOUNTS =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';

// Support-request status → badge class.
export const REQ_BADGE = {
  REQUESTED: 'b-amber', APPROVED_URGENT: 'b-red', APPROVED_STANDARD: 'b-sky',
  DISTRIBUTING: 'b-violet', COMPLETED: 'b-green', INELIGIBLE: 'b-gray', CANCELLED: 'b-gray',
};
export const REQ_STATUSES = Object.keys(REQ_BADGE);

// All twelve sectors of Kamonyi District. The list has to be complete: a
// sector missing from this array is a sector whose residents an officer
// cannot register at all, and the coverage report would then read as though
// nobody there has a disability.
export const SECTORS = [
  'Gacurabwenge', 'Karama', 'Kayenzi', 'Kayumbu', 'Mugina', 'Musambira',
  'Ngamba', 'Nyamiyaga', 'Nyarubaka', 'Rugarika', 'Rukoma', 'Runda',
];

export const OPP_ICON = { scholarship: '🎓', job: '💼', training: '📚', announcement: '📣' };

export function roleHome(role) {
  return ROLES[role]?.home || '/login';
}
