// ─────────────────────────────────────────────────────────────
// Bilingual labels (proposal Table 6: English + Kinyarwanda).
// Every string is [EN, RW]; the active language picks the index.
// ─────────────────────────────────────────────────────────────
export const T = {
  appName: ['Disability Support IMS', "Sisitemu y'Ubufasha bw'Abafite Ubumuga"],
  tagline: [
    'Inclusive registry & support coordination · Kamonyi District',
    'Registry irimo bose & guhuza ubufasha · Akarere ka Kamonyi',
  ],
  email: ['Email', 'Imeyili'], password: ['Password', 'Ijambobanga'],
  login: ['Log in', 'Injira'], logout: ['Log out', 'Sohoka'],
  demo: ['Demo accounts (tap to sign in)', 'Konti zo kwipimisha (kanda winjire)'],
  lang: ['Language', 'Ururimi'], text: ['Text', 'Inyandiko'], contrast: ['Contrast', 'Ibara'],
  save: ['Save', 'Bika'], cancel: ['Cancel', 'Reka'], submit: ['Submit', 'Ohereza'],
  officer: ['Local Officer', "Umukozi w'Akarere"],
  beneficiary: ['Beneficiary / Guardian', 'Uwunguka / Umurezi'],
  provider: ['Support Provider', 'Utanga Ubufasha'], admin: ['Administrator', 'Umuyobozi'],
  REQUESTED: ['Requested', 'Byasabwe'], APPROVED_URGENT: ['Approved · Urgent', 'Byemejwe · Byihutirwa'],
  APPROVED_STANDARD: ['Approved · Standard', 'Byemejwe · Bisanzwe'], DISTRIBUTING: ['Distributing', 'Biratangwa'],
  COMPLETED: ['Completed', 'Byarangiye'], INELIGIBLE: ['Not eligible', 'Ntibyemewe'],
  CANCELLED: ['Cancelled', 'Byahagaritswe'],
  ACTIVE: ['Active', 'Bikora'], ARCHIVED: ['Archived', 'Byabitswe'], DECEASED: ['Deceased', 'Yitabye Imana'],
  INACTIVE: ['Deactivated', 'Byahagaritswe'],
};

export const DISABILITY = {
  seeing: ['Seeing', 'Kubona'], hearing: ['Hearing', 'Kumva'], walking: ['Walking / mobility', 'Kugenda'],
  cognition: ['Remembering / concentrating', 'Kwibuka'], selfcare: ['Self-care', 'Kwitaho'], communication: ['Communication', 'Kuvuga'],
};

export const DIFFICULTY = {
  some: ['Some difficulty', 'Ingorane nkeya'], alot: ['A lot of difficulty', 'Ingorane nyinshi'], cannot: ['Cannot do at all', 'Ntabasha na gato'],
};

// Build the translator object for a given language ('en' | 'rw').
export function makeT(lang) {
  const i = lang === 'rw' ? 1 : 0;
  const t = (k) => (T[k] ? T[k][i] : k);
  t.x = (en, rw) => (lang === 'rw' ? rw : en);
  t.d = (k) => (DISABILITY[k] ? DISABILITY[k][i] : k);
  t.diff = (k) => (DIFFICULTY[k] ? DIFFICULTY[k][i] : k);
  t.lang = lang;
  return t;
}
