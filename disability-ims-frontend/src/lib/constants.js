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

// Support-request status → badge class.
export const REQ_BADGE = {
  REQUESTED: 'b-amber', APPROVED_URGENT: 'b-red', APPROVED_STANDARD: 'b-sky',
  DISTRIBUTING: 'b-violet', COMPLETED: 'b-green', INELIGIBLE: 'b-gray', CANCELLED: 'b-gray',
};
export const REQ_STATUSES = Object.keys(REQ_BADGE);

export const SECTORS = ['Runda', 'Gacurabwenge', 'Musambira', 'Nyarubaka'];

export const OPP_ICON = { scholarship: '🎓', job: '💼', training: '📚', announcement: '📣' };

export function roleHome(role) {
  return ROLES[role]?.home || '/login';
}
