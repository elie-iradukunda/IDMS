import { DISABILITY, DIFFICULTY } from './i18n.js';

// CSV column definitions for a registry export, shared by the officer's
// registry and the administrator's oversight view so a district return
// assembled from either one has the same shape.
//
// The national ID is included only for the officer, who already sees it on
// screen — an export must not become a side door that hands an administrator
// a spreadsheet of identity numbers their own screen deliberately withholds.
export function registryColumns({ t, includeNationalId = false }) {
  const impairments = (b) => (b.impairments || [])
    .map((i) => `${DISABILITY[i.type]?.[0] || i.type} (${DIFFICULTY[i.level]?.[0] || i.level})`)
    .join('; ');

  return [
    { header: 'Code', value: (b) => b.code },
    { header: 'Full name', value: (b) => b.fullName },
    ...(includeNationalId ? [{ header: 'National ID', value: (b) => b.nationalId || '' }] : []),
    { header: 'Sector', value: (b) => b.sector || '' },
    { header: 'Cell', value: (b) => b.cell || '' },
    { header: 'Village', value: (b) => b.village || '' },
    { header: 'Guardian', value: (b) => b.guardianName || '' },
    { header: 'Impairments', value: impairments },
    { header: 'Daily challenges', value: (b) => b.dailyChallenges || '' },
    { header: 'Support needs', value: (b) => b.supportNeeds || '' },
    { header: 'Record status', value: (b) => b.status },
    { header: 'Verified', value: (b) => (b.verified ? 'yes' : 'no') },
    {
      header: 'Access',
      value: (b) => (b.email ? 'direct login' : 'guardian/officer-mediated'),
    },
    { header: 'Registered on', value: (b) => (b.createdAt ? new Date(b.createdAt).toISOString().slice(0, 10) : '') },
  ];
}
