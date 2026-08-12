// ─────────────────────────────────────────────────────────────
// report.service.js — the reporting layer.
//
// A district registry that cannot produce a report is a registry whose
// numbers have to be retyped by hand into the monthly return, which is how a
// second, divergent copy of the truth comes into existence. So every role can
// export what it is entitled to see — and only that.
//
// The shape here is deliberate: a report is DATA plus a DESCRIPTION of itself
// (title, subtitle, sheets, columns, summary figures). The Excel and PDF
// renderers then consume the same description, so the two formats can never
// drift apart and a column added once appears in both.
//
// Scoping is the whole security story. `catalogue()` decides which reports a
// role may run at all, and each builder re-derives its own scope from the
// authenticated user rather than trusting a query parameter — a provider must
// not be able to ask for the registry by editing a URL, and a beneficiary's
// personal report must be about them and nobody else.
// ─────────────────────────────────────────────────────────────
import { Op } from 'sequelize';
import {
  Beneficiary, Impairment, SupportRequest, RequestEvent, Correction, Provider,
  User, Opportunity, OpportunityApplication, AuditLog,
} from '../models/index.js';
import { AppError } from './registry.service.js';
import { reports as districtMetrics } from './reports.service.js';
import { DISABILITY_LABEL, DIFFICULTY_LABEL, STATUS_LABEL } from './report.labels.js';

const notFound = (m) => { throw new AppError(404, m); };
const forbid = (m) => { throw new AppError(403, m); };

const date = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const dateTime = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '');
const yesNo = (v) => (v ? 'Yes' : 'No');
const impairmentText = (b) => (b.impairments || [])
  .map((i) => `${DISABILITY_LABEL[i.type] || i.type} (${DIFFICULTY_LABEL[i.level] || i.level})`)
  .join('; ');

// ══════════════════════════════════════════════════════════════
// CATALOGUE — what each role may run.
// ══════════════════════════════════════════════════════════════
const CATALOGUE = {
  'beneficiary-record': {
    roles: ['BENEFICIARY'],
    title: 'My record and support history',
    description: 'Everything recorded about you: your registry record, your impairments, every support request and its decision, your correction requests and your opportunity applications.',
  },
  'officer-registry': {
    roles: ['OFFICER'],
    title: 'Beneficiary registry',
    description: 'The full registry record for every beneficiary, with impairments, location, support needs and access route.',
  },
  'officer-support': {
    roles: ['OFFICER'],
    title: 'Support requests and decisions',
    description: 'Every support request with its origin, decision, recorded reason and turnaround.',
  },
  'officer-corrections': {
    roles: ['OFFICER'],
    title: 'Correction requests',
    description: 'What beneficiaries said was wrong in their record, and what was decided.',
  },
  'provider-offers': {
    roles: ['PROVIDER'],
    title: 'My support offers',
    description: 'Offers this organisation has submitted, with the officer\'s decision and reason. Beneficiaries appear by code only.',
  },
  'provider-needs': {
    roles: ['PROVIDER'],
    title: 'Recorded needs matching my search',
    description: 'Verified, active recorded needs by code and sector. Names, national IDs and personal history are withheld.',
  },
  'district-summary': {
    roles: ['ADMIN'],
    title: 'District coverage and distribution report',
    description: 'The Table 3.3 measures — coverage, completeness, duplication, traceability, turnaround — with breakdowns by impairment, sector, status and origin.',
  },
  'admin-registry': {
    roles: ['ADMIN'],
    title: 'Registry oversight',
    description: 'Every registry record for oversight. National ID numbers are deliberately excluded.',
  },
  'admin-users': {
    roles: ['ADMIN'],
    title: 'Users, roles and provider organisations',
    description: 'Every account with its role, scope and status, and every provider organisation with its activity.',
  },
  'admin-opportunities': {
    roles: ['ADMIN', 'OFFICER'],
    title: 'Opportunities and applications',
    description: 'Published opportunities with uptake, and every application with its origin and outcome.',
  },
  'admin-audit': {
    roles: ['ADMIN'],
    title: 'Audit log',
    description: 'Every recorded action, who took it and when. Append-only.',
  },
};

export function catalogue(user) {
  return Object.entries(CATALOGUE)
    .filter(([, r]) => r.roles.includes(user.role))
    .map(([key, r]) => ({ key, title: r.title, description: r.description }));
}

function assertAllowed(user, key) {
  const spec = CATALOGUE[key];
  if (!spec) notFound('That report does not exist');
  if (!spec.roles.includes(user.role)) forbid('You do not have access to that report');
  return spec;
}

// ══════════════════════════════════════════════════════════════
// BUILDERS
// Each returns { title, subtitle, meta[], summary[], sheets[] }.
// A sheet is { name, columns:[{header,key,width,type}], rows[] }.
// ══════════════════════════════════════════════════════════════

async function beneficiaryRecord(user) {
  if (!user.beneficiaryId) forbid('No beneficiary record is linked to this account');
  const b = await Beneficiary.findByPk(user.beneficiaryId, {
    include: [{ model: Impairment, as: 'impairments' }],
  });
  if (!b) notFound('Beneficiary record not found');

  const [requests, corrections, applications] = await Promise.all([
    SupportRequest.findAll({
      where: { beneficiaryId: b.id },
      include: [{ model: Provider, as: 'provider' }, { model: RequestEvent, as: 'timeline' }],
      order: [['createdAt', 'DESC']],
    }),
    Correction.findAll({ where: { beneficiaryId: b.id }, order: [['createdAt', 'DESC']] }),
    OpportunityApplication.findAll({
      where: { beneficiaryId: b.id },
      include: [{ model: Opportunity, as: 'opportunity' }],
      order: [['createdAt', 'DESC']],
    }),
  ]);

  return {
    title: 'My record and support history',
    subtitle: `${b.fullName} · ${b.code}`,
    meta: [
      ['Record code', b.code],
      ['Full name', b.fullName],
      ['Sector', b.sector || '—'],
      ['Cell', b.cell || '—'],
      ['Village', b.village || '—'],
      ['Guardian', b.guardianName || '—'],
      ['Record status', STATUS_LABEL[b.status] || b.status],
      ['Verified by an officer', yesNo(b.verified)],
      ['Registered on', date(b.createdAt)],
      ['Access', b.email ? `Direct login (${b.email})` : 'Guardian- or officer-mediated'],
    ],
    // The record separates these three deliberately: a disability category
    // alone cannot say what a person actually needs.
    narrative: [
      ['Impairments', impairmentText(b) || '—'],
      ['Daily challenges', b.dailyChallenges || '—'],
      ['Support needs', b.supportNeeds || '—'],
    ],
    summary: [
      ['Support requests', requests.length],
      ['Support delivered', requests.filter((r) => r.status === 'COMPLETED').length],
      ['Correction requests', corrections.length],
      ['Opportunity applications', applications.length],
    ],
    sheets: [
      {
        name: 'Support history',
        columns: [
          { header: 'Code', key: 'code', width: 12 },
          { header: 'Support need', key: 'need', width: 44 },
          { header: 'Raised by', key: 'origin', width: 16 },
          { header: 'Status', key: 'status', width: 20 },
          { header: 'Reason recorded by the officer', key: 'reason', width: 56 },
          { header: 'Provider', key: 'provider', width: 26 },
          { header: 'Requested', key: 'created', width: 13 },
          { header: 'Delivered', key: 'completed', width: 13 },
        ],
        rows: requests.map((r) => ({
          code: r.code,
          need: r.need,
          origin: { BENEFICIARY: 'You', OFFICER: 'Your officer', PROVIDER: 'A provider' }[r.origin] || r.origin,
          status: STATUS_LABEL[r.status] || r.status,
          reason: r.decisionReason || '—',
          provider: r.provider?.name || '—',
          created: date(r.createdAt),
          completed: date(r.completedAt),
        })),
      },
      {
        name: 'Correction requests',
        columns: [
          { header: 'What you said was wrong', key: 'text', width: 66 },
          { header: 'Outcome', key: 'status', width: 26 },
          { header: 'Submitted', key: 'created', width: 13 },
        ],
        rows: corrections.map((c) => ({
          text: c.text,
          status: { PENDING: 'Awaiting review', APPLIED: 'Applied to your record', DECLINED: 'Reviewed, record unchanged' }[c.status] || c.status,
          created: date(c.createdAt),
        })),
      },
      {
        name: 'Opportunity applications',
        columns: [
          { header: 'Opportunity', key: 'title', width: 44 },
          { header: 'Type', key: 'kind', width: 15 },
          { header: 'Applied by', key: 'origin', width: 20 },
          { header: 'Outcome', key: 'status', width: 22 },
          { header: 'Reason recorded', key: 'reason', width: 56 },
          { header: 'Applied', key: 'created', width: 13 },
        ],
        rows: applications.map((a) => ({
          title: a.opportunity?.title || '—',
          kind: a.opportunity?.kind || '—',
          origin: a.origin === 'OFFICER' ? 'Your officer, for you' : 'You',
          status: STATUS_LABEL[a.status] || a.status,
          reason: a.decisionReason || '—',
          created: date(a.createdAt),
        })),
      },
    ],
  };
}

const registryColumns = (includeNationalId) => [
  { header: 'Code', key: 'code', width: 11 },
  { header: 'Full name', key: 'fullName', width: 26 },
  ...(includeNationalId ? [{ header: 'National ID', key: 'nationalId', width: 20 }] : []),
  { header: 'Sector', key: 'sector', width: 15 },
  { header: 'Cell', key: 'cell', width: 14 },
  { header: 'Village', key: 'village', width: 16 },
  { header: 'Guardian', key: 'guardian', width: 20 },
  { header: 'Impairments', key: 'impairments', width: 40 },
  { header: 'Daily challenges', key: 'daily', width: 40 },
  { header: 'Support needs', key: 'needs', width: 40 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Verified', key: 'verified', width: 10 },
  { header: 'Access', key: 'access', width: 26 },
  { header: 'Registered', key: 'created', width: 13 },
];

const registryRow = (b, includeNationalId) => ({
  code: b.code,
  fullName: b.fullName,
  ...(includeNationalId ? { nationalId: b.nationalId || '' } : {}),
  sector: b.sector || '',
  cell: b.cell || '',
  village: b.village || '',
  guardian: b.guardianName || '',
  impairments: impairmentText(b),
  daily: b.dailyChallenges || '',
  needs: b.supportNeeds || '',
  status: STATUS_LABEL[b.status] || b.status,
  verified: yesNo(b.verified),
  access: b.email ? 'Direct login' : 'Guardian/officer-mediated',
  created: date(b.createdAt),
});

async function registryReport({ includeNationalId, filters, title }) {
  const where = {
    ...(filters.sector && filters.sector !== 'all' && { sector: filters.sector }),
    ...(filters.status && filters.status !== 'all' && { status: filters.status }),
  };
  const rows = await Beneficiary.findAll({
    where,
    include: [{ model: Impairment, as: 'impairments' }],
    order: [['code', 'ASC']],
  });

  const bySector = rows.reduce((m, b) => ({ ...m, [b.sector]: (m[b.sector] || 0) + 1 }), {});

  return {
    title,
    subtitle: [
      filters.sector && filters.sector !== 'all' ? `Sector: ${filters.sector}` : 'All sectors',
      filters.status && filters.status !== 'all' ? `Status: ${STATUS_LABEL[filters.status] || filters.status}` : 'All statuses',
    ].join(' · '),
    summary: [
      ['Records in this report', rows.length],
      ['Active', rows.filter((b) => b.status === 'ACTIVE').length],
      ['Archived', rows.filter((b) => b.status === 'ARCHIVED').length],
      ['Deceased', rows.filter((b) => b.status === 'DECEASED').length],
      ['Verified', rows.filter((b) => b.verified).length],
      ['Can reach their own record directly', rows.filter((b) => b.email).length],
    ],
    sheets: [
      {
        name: 'Registry',
        columns: registryColumns(includeNationalId),
        rows: rows.map((b) => registryRow(b, includeNationalId)),
      },
      {
        name: 'By sector',
        columns: [
          { header: 'Sector', key: 'sector', width: 24 },
          { header: 'Registered', key: 'count', width: 14, type: 'number' },
        ],
        rows: Object.entries(bySector).sort((a, b) => b[1] - a[1]).map(([sector, count]) => ({ sector, count })),
      },
      {
        name: 'By impairment',
        columns: [
          { header: 'Impairment', key: 'type', width: 30 },
          { header: 'People recorded', key: 'count', width: 18, type: 'number' },
        ],
        rows: Object.entries(
          rows.flatMap((b) => (b.impairments || []).map((i) => i.type))
            .reduce((m, t) => ({ ...m, [t]: (m[t] || 0) + 1 }), {}),
        ).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type: DISABILITY_LABEL[type] || type, count })),
      },
    ],
  };
}

async function supportReport(filters) {
  const rows = await SupportRequest.findAll({
    where: { ...(filters.status && filters.status !== 'all' && { status: filters.status }) },
    include: [
      { model: Beneficiary, as: 'beneficiary' },
      { model: Provider, as: 'provider' },
    ],
    order: [['createdAt', 'DESC']],
  });

  const DAY = 864e5;
  const done = rows.filter((r) => r.status === 'COMPLETED' && r.completedAt);
  const avg = done.length
    ? +(done.reduce((s, r) => s + (new Date(r.completedAt) - new Date(r.createdAt)) / DAY, 0) / done.length).toFixed(1)
    : null;
  const decided = rows.filter((r) => !['REQUESTED', 'CANCELLED'].includes(r.status));
  const withReason = decided.filter((r) => r.decisionReason?.trim()).length;

  const tally = (key) => rows.reduce((m, r) => ({ ...m, [r[key]]: (m[r[key]] || 0) + 1 }), {});

  return {
    title: 'Support requests and decisions',
    subtitle: filters.status && filters.status !== 'all'
      ? `Status: ${STATUS_LABEL[filters.status] || filters.status}`
      : 'All statuses',
    summary: [
      ['Requests in this report', rows.length],
      ['Awaiting a decision', rows.filter((r) => r.status === 'REQUESTED').length],
      ['Delivered', rows.filter((r) => r.status === 'COMPLETED').length],
      ['Decisions carrying a recorded reason', decided.length ? `${Math.round((withReason / decided.length) * 100)}%` : 'n/a'],
      ['Average turnaround (days)', avg ?? 'n/a'],
    ],
    sheets: [
      {
        name: 'Support requests',
        columns: [
          { header: 'Code', key: 'code', width: 11 },
          { header: 'Beneficiary', key: 'name', width: 26 },
          { header: 'Record', key: 'bcode', width: 11 },
          { header: 'Sector', key: 'sector', width: 15 },
          { header: 'Support need', key: 'need', width: 44 },
          { header: 'Origin', key: 'origin', width: 14 },
          { header: 'Status', key: 'status', width: 20 },
          { header: 'Recorded decision reason', key: 'reason', width: 56 },
          { header: 'Provider', key: 'provider', width: 26 },
          { header: 'Requested', key: 'created', width: 13 },
          { header: 'Delivered', key: 'completed', width: 13 },
          { header: 'Days to deliver', key: 'days', width: 15, type: 'number' },
        ],
        rows: rows.map((r) => ({
          code: r.code,
          name: r.beneficiary?.fullName || '',
          bcode: r.beneficiary?.code || '',
          sector: r.beneficiary?.sector || '',
          need: r.need,
          origin: r.origin,
          status: STATUS_LABEL[r.status] || r.status,
          reason: r.decisionReason || '',
          provider: r.provider?.name || '',
          created: date(r.createdAt),
          completed: date(r.completedAt),
          days: r.completedAt ? Math.round((new Date(r.completedAt) - new Date(r.createdAt)) / DAY) : null,
        })),
      },
      {
        name: 'By status',
        columns: [
          { header: 'Status', key: 'status', width: 26 },
          { header: 'Requests', key: 'count', width: 14, type: 'number' },
        ],
        rows: Object.entries(tally('status')).map(([k, count]) => ({ status: STATUS_LABEL[k] || k, count })),
      },
      {
        name: 'By origin',
        columns: [
          { header: 'Raised by', key: 'origin', width: 26 },
          { header: 'Requests', key: 'count', width: 14, type: 'number' },
        ],
        rows: Object.entries(tally('origin')).map(([origin, count]) => ({ origin, count })),
      },
    ],
  };
}

async function correctionsReport(filters) {
  const rows = await Correction.findAll({
    where: { ...(filters.status && filters.status !== 'all' && { status: filters.status }) },
    include: [{ model: Beneficiary, as: 'beneficiary' }],
    order: [['createdAt', 'DESC']],
  });

  return {
    title: 'Correction requests',
    subtitle: 'What beneficiaries said was wrong in their record, and what was decided',
    summary: [
      ['Correction requests', rows.length],
      ['Awaiting review', rows.filter((c) => c.status === 'PENDING').length],
      ['Applied to the record', rows.filter((c) => c.status === 'APPLIED').length],
      ['Reviewed, record unchanged', rows.filter((c) => c.status === 'DECLINED').length],
    ],
    sheets: [{
      name: 'Corrections',
      columns: [
        { header: 'Record', key: 'code', width: 11 },
        { header: 'Beneficiary', key: 'name', width: 26 },
        { header: 'Sector', key: 'sector', width: 15 },
        { header: 'What they said was wrong', key: 'text', width: 66 },
        { header: 'Outcome', key: 'status', width: 26 },
        { header: 'Submitted', key: 'created', width: 13 },
      ],
      rows: rows.map((c) => ({
        code: c.beneficiary?.code || '',
        name: c.beneficiary?.fullName || '',
        sector: c.beneficiary?.sector || '',
        text: c.text,
        status: STATUS_LABEL[c.status] || c.status,
        created: date(c.createdAt),
      })),
    }],
  };
}

async function providerOffers(user) {
  if (!user.providerId) forbid('Your account is not linked to a provider organisation');
  const org = await Provider.findByPk(user.providerId);
  const rows = await SupportRequest.findAll({
    where: { providerId: user.providerId },
    include: [{ model: Beneficiary, as: 'beneficiary', attributes: ['code', 'sector'] }],
    order: [['createdAt', 'DESC']],
  });

  return {
    title: 'My support offers',
    subtitle: org?.name || 'Provider organisation',
    summary: [
      ['Offers submitted', rows.length],
      ['Awaiting a decision', rows.filter((r) => r.status === 'REQUESTED').length],
      ['Delivered', rows.filter((r) => r.status === 'COMPLETED').length],
    ],
    // Beneficiaries appear by code only: a provider can act on a recorded need
    // without ever reading the person's name.
    sheets: [{
      name: 'My offers',
      columns: [
        { header: 'Code', key: 'code', width: 11 },
        { header: 'Beneficiary (code only)', key: 'bcode', width: 22 },
        { header: 'Sector', key: 'sector', width: 15 },
        { header: 'Support offered', key: 'need', width: 46 },
        { header: 'Status', key: 'status', width: 20 },
        { header: "Officer's recorded reason", key: 'reason', width: 56 },
        { header: 'Submitted', key: 'created', width: 13 },
      ],
      rows: rows.map((r) => ({
        code: r.code,
        bcode: r.beneficiary?.code || '',
        sector: r.beneficiary?.sector || '',
        need: r.need,
        status: STATUS_LABEL[r.status] || r.status,
        reason: r.decisionReason || '',
        created: date(r.createdAt),
      })),
    }],
  };
}

async function providerNeeds(filters) {
  const rows = await Beneficiary.findAll({
    where: {
      verified: true, status: 'ACTIVE',
      ...(filters.sector && filters.sector !== 'all' && { sector: filters.sector }),
    },
    attributes: ['id', 'code', 'sector', 'supportNeeds'],
    include: [{
      model: Impairment, as: 'impairments', attributes: ['type', 'level'],
      ...(filters.impairmentType && filters.impairmentType !== 'all' && { where: { type: filters.impairmentType } }),
    }],
    order: [['code', 'ASC']],
  });

  return {
    title: 'Recorded needs matching my search',
    subtitle: 'Least privilege — names, national IDs and personal history are withheld',
    summary: [['Recorded needs matching', rows.length]],
    sheets: [{
      name: 'Recorded needs',
      columns: [
        { header: 'Beneficiary (code only)', key: 'code', width: 22 },
        { header: 'Sector', key: 'sector', width: 16 },
        { header: 'Impairments', key: 'impairments', width: 40 },
        { header: 'Recorded support need', key: 'needs', width: 56 },
      ],
      rows: rows.map((b) => ({
        code: b.code,
        sector: b.sector || '',
        impairments: impairmentText(b),
        needs: b.supportNeeds || '',
      })),
    }],
  };
}

async function districtSummary() {
  const r = await districtMetrics();
  return {
    title: 'District coverage and distribution report',
    subtitle: 'Kamonyi District — the Table 3.3 measures',
    summary: [
      ['Beneficiaries registered', r.registered],
      ['Estimated population with disabilities', r.estimatedPopulation],
      ['Coverage of estimated population', `${r.coveragePercent}%`],
      ['Record completeness', `${r.completenessPercent}%`],
      ['Duplication rate', `${r.duplicationPercent}%`],
      ['Decisions carrying a recorded reason', `${r.traceabilityPercent}%`],
      ['Average turnaround (days)', r.avgTurnaroundDays ?? 'n/a'],
      ['Support delivered', r.supportDelivered],
    ],
    notes: [
      ['Coverage', 'whether the registry finds the people it exists to serve.'],
      ['Completeness', 'whether a record says enough to allocate support from.'],
      ['Duplication', 'whether it is a single authoritative record per person.'],
      ['Traceability', 'whether support can be shown to be fair rather than merely asserted.'],
      ['Officer-mediated applications', 'the share of the population a self-service-only system would have excluded — a high figure is a measure of reach, not of failure.'],
    ],
    sheets: [
      {
        name: 'Measures',
        columns: [
          { header: 'Measure', key: 'measure', width: 52 },
          { header: 'Value', key: 'value', width: 18 },
        ],
        rows: [
          ['Beneficiaries registered', r.registered],
          ['Active in coordination', r.activeBeneficiaries],
          ['Estimated population with disabilities', r.estimatedPopulation],
          ['Coverage of estimated population (%)', r.coveragePercent],
          ['Record completeness (%)', r.completenessPercent],
          ['Duplication rate (%)', r.duplicationPercent],
          ['Verified records (%)', r.verifiedPercent],
          ['Beneficiaries with a direct login (%)', r.withAccountPercent],
          ['Total support requests', r.totalRequests],
          ['Support delivered', r.supportDelivered],
          ['Decisions with a recorded reason (%)', r.traceabilityPercent],
          ['Average turnaround (days)', r.avgTurnaroundDays ?? 'n/a'],
          ['Corrections awaiting review', r.pendingCorrections],
          ['Opportunity applications received', r.totalApplications],
          ['Applications awaiting a decision', r.applicationsPending],
          ['Applications accepted', r.applicationsAccepted],
          ['Beneficiaries who have applied to anything (%)', r.applicantReachPercent],
          ['Applications submitted by an officer for someone (%)', r.officerMediatedApplicationsPercent],
          ['User accounts', r.totalUsers],
          ['Provider organisations', r.totalProviders],
          ['Opportunities published', r.totalOpportunities],
        ].map(([measure, value]) => ({ measure, value })),
      },
      {
        name: 'By impairment',
        columns: [
          { header: 'Impairment', key: 'type', width: 32 },
          { header: 'People recorded', key: 'count', width: 18, type: 'number' },
        ],
        rows: (r.byImpairment || []).map((x) => ({ type: DISABILITY_LABEL[x.type] || x.type, count: x.count })),
      },
      {
        name: 'By sector',
        columns: [
          { header: 'Sector', key: 'sector', width: 24 },
          { header: 'Registered', key: 'count', width: 14, type: 'number' },
        ],
        rows: Object.entries(r.bySector || {}).sort((a, b) => b[1] - a[1]).map(([sector, count]) => ({ sector, count })),
      },
      {
        name: 'Requests by status',
        columns: [
          { header: 'Status', key: 'status', width: 26 },
          { header: 'Requests', key: 'count', width: 14, type: 'number' },
        ],
        rows: Object.entries(r.byStatus || {}).map(([k, count]) => ({ status: STATUS_LABEL[k] || k, count })),
      },
      {
        name: 'Requests by origin',
        columns: [
          { header: 'Raised by', key: 'origin', width: 26 },
          { header: 'Requests', key: 'count', width: 14, type: 'number' },
        ],
        rows: Object.entries(r.byOrigin || {}).map(([origin, count]) => ({ origin, count })),
      },
    ],
  };
}

async function adminUsers() {
  const [users, providers, offerCounts, accountCounts] = await Promise.all([
    User.findAll({ attributes: { exclude: ['passwordHash', 'resetTokenHash', 'resetTokenExpiry'] }, order: [['id', 'ASC']] }),
    Provider.findAll({ order: [['name', 'ASC']] }),
    SupportRequest.findAll({ attributes: ['providerId'], raw: true }),
    User.findAll({ attributes: ['providerId'], where: { role: 'PROVIDER' }, raw: true }),
  ]);
  const offers = offerCounts.reduce((m, r) => (r.providerId ? { ...m, [r.providerId]: (m[r.providerId] || 0) + 1 } : m), {});
  const accounts = accountCounts.reduce((m, r) => (r.providerId ? { ...m, [r.providerId]: (m[r.providerId] || 0) + 1 } : m), {});
  const byRole = users.reduce((m, u) => ({ ...m, [u.role]: (m[u.role] || 0) + 1 }), {});

  return {
    title: 'Users, roles and provider organisations',
    subtitle: 'Permissions attach to roles, not to individuals',
    summary: [
      ['User accounts', users.length],
      ['Active', users.filter((u) => u.status === 'ACTIVE').length],
      ['Deactivated', users.filter((u) => u.status !== 'ACTIVE').length],
      ['Provider organisations', providers.length],
    ],
    sheets: [
      {
        name: 'Users',
        columns: [
          { header: 'Name', key: 'name', width: 28 },
          { header: 'Email', key: 'email', width: 34 },
          { header: 'Role', key: 'role', width: 15 },
          { header: 'Sector', key: 'sector', width: 16 },
          { header: 'Status', key: 'status', width: 14 },
          { header: 'Language', key: 'language', width: 10 },
          { header: 'Created', key: 'created', width: 13 },
        ],
        rows: users.map((u) => ({
          name: u.fullName, email: u.email, role: u.role,
          sector: u.sector || (u.role === 'OFFICER' ? 'District-wide' : ''),
          status: STATUS_LABEL[u.status] || u.status,
          language: u.language || '', created: date(u.createdAt),
        })),
      },
      {
        name: 'By role',
        columns: [
          { header: 'Role', key: 'role', width: 22 },
          { header: 'Accounts', key: 'count', width: 14, type: 'number' },
        ],
        rows: Object.entries(byRole).map(([role, count]) => ({ role, count })),
      },
      {
        name: 'Provider organisations',
        columns: [
          { header: 'Organisation', key: 'name', width: 34 },
          { header: 'Type', key: 'type', width: 18 },
          { header: 'Contact', key: 'contact', width: 30 },
          { header: 'Accounts', key: 'accounts', width: 12, type: 'number' },
          { header: 'Requests in the record', key: 'offers', width: 22, type: 'number' },
          { header: 'Added', key: 'created', width: 13 },
        ],
        rows: providers.map((p) => ({
          name: p.name, type: p.type || '', contact: p.contact || '',
          accounts: accounts[p.id] || 0, offers: offers[p.id] || 0, created: date(p.createdAt),
        })),
      },
    ],
  };
}

async function opportunitiesReport() {
  const [opps, apps] = await Promise.all([
    Opportunity.findAll({ include: [{ model: User, as: 'author', attributes: ['fullName'] }], order: [['createdAt', 'DESC']] }),
    OpportunityApplication.findAll({
      include: [
        { model: Opportunity, as: 'opportunity', attributes: ['title', 'kind'] },
        { model: Beneficiary, as: 'beneficiary', attributes: ['code', 'fullName', 'sector'] },
      ],
      order: [['createdAt', 'DESC']],
    }),
  ]);
  const perOpp = apps.reduce((m, a) => ({ ...m, [a.opportunityId]: (m[a.opportunityId] || 0) + 1 }), {});

  return {
    title: 'Opportunities and applications',
    subtitle: 'Publishing an opportunity is not the outcome — somebody applying for it is',
    summary: [
      ['Opportunities published', opps.length],
      ['Open for applications', opps.filter((o) => o.acceptsApplications).length],
      ['Applications received', apps.length],
      ['Awaiting a decision', apps.filter((a) => ['SUBMITTED', 'SHORTLISTED'].includes(a.status)).length],
      ['Accepted', apps.filter((a) => a.status === 'ACCEPTED').length],
      ['Submitted by an officer on someone\'s behalf', apps.filter((a) => a.origin === 'OFFICER').length],
    ],
    sheets: [
      {
        name: 'Opportunities',
        columns: [
          { header: 'Title', key: 'title', width: 44 },
          { header: 'Type', key: 'kind', width: 15 },
          { header: 'Organisation', key: 'org', width: 26 },
          { header: 'Published by', key: 'author', width: 24 },
          { header: 'Closing date', key: 'deadline', width: 14 },
          { header: 'Places', key: 'slots', width: 10, type: 'number' },
          { header: 'Applications', key: 'apps', width: 14, type: 'number' },
          { header: 'Published', key: 'created', width: 13 },
        ],
        rows: opps.map((o) => ({
          title: o.title, kind: o.kind, org: o.org || '',
          author: o.author?.fullName || '', deadline: o.deadline || '',
          slots: o.slots ?? null, apps: perOpp[o.id] || 0, created: date(o.createdAt),
        })),
      },
      {
        name: 'Applications',
        columns: [
          { header: 'Opportunity', key: 'title', width: 40 },
          { header: 'Type', key: 'kind', width: 14 },
          { header: 'Applicant', key: 'name', width: 26 },
          { header: 'Record', key: 'code', width: 11 },
          { header: 'Sector', key: 'sector', width: 15 },
          { header: 'Applied by', key: 'origin', width: 26 },
          { header: 'Outcome', key: 'status', width: 22 },
          { header: 'Recorded reason', key: 'reason', width: 56 },
          { header: 'Applied', key: 'created', width: 13 },
        ],
        rows: apps.map((a) => ({
          title: a.opportunity?.title || '', kind: a.opportunity?.kind || '',
          name: a.beneficiary?.fullName || '', code: a.beneficiary?.code || '',
          sector: a.beneficiary?.sector || '',
          origin: a.origin === 'OFFICER' ? 'Officer, on their behalf' : 'The beneficiary',
          status: STATUS_LABEL[a.status] || a.status,
          reason: a.decisionReason || '', created: date(a.createdAt),
        })),
      },
    ],
  };
}

async function auditReport(filters) {
  const term = String(filters.q || '').trim();
  const rows = await AuditLog.findAll({
    where: term ? {
      [Op.or]: [
        { action: { [Op.like]: `%${term}%` } },
        { actorName: { [Op.like]: `%${term}%` } },
        { entity: { [Op.like]: `%${term}%` } },
      ],
    } : {},
    order: [['createdAt', 'DESC']],
    limit: 5000,   // a report is a document, not a database dump
  });

  return {
    title: 'Audit log',
    subtitle: term ? `Filtered by "${term}"` : 'Every recorded action, most recent first',
    summary: [
      ['Entries in this report', rows.length],
      ['Distinct actors', new Set(rows.map((r) => r.actorName)).size],
      ['Earliest entry', rows.length ? date(rows[rows.length - 1].createdAt) : '—'],
      ['Most recent entry', rows.length ? date(rows[0].createdAt) : '—'],
    ],
    sheets: [{
      name: 'Audit log',
      columns: [
        { header: 'When', key: 'when', width: 18 },
        { header: 'Who', key: 'who', width: 26 },
        { header: 'Action', key: 'action', width: 62 },
        { header: 'Record', key: 'entity', width: 24 },
        { header: 'What changed', key: 'meta', width: 60 },
      ],
      rows: rows.map((r) => ({
        when: dateTime(r.createdAt),
        who: r.actorName || 'System',
        action: r.action,
        entity: r.entity || '',
        meta: r.meta ? JSON.stringify(r.meta) : '',
      })),
    }],
  };
}

// ══════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════
export async function build(user, key, filters = {}) {
  const spec = assertAllowed(user, key);

  const report = await {
    'beneficiary-record': () => beneficiaryRecord(user),
    'officer-registry': () => registryReport({ includeNationalId: true, filters, title: 'Beneficiary registry' }),
    'officer-support': () => supportReport(filters),
    'officer-corrections': () => correctionsReport(filters),
    'provider-offers': () => providerOffers(user),
    'provider-needs': () => providerNeeds(filters),
    'district-summary': () => districtSummary(),
    // Oversight deliberately excludes national IDs — the screen withholds
    // them, so the export must not become the side door that hands them out.
    'admin-registry': () => registryReport({ includeNationalId: false, filters, title: 'Registry oversight' }),
    'admin-users': () => adminUsers(),
    'admin-opportunities': () => opportunitiesReport(),
    'admin-audit': () => auditReport(filters),
  }[key]();

  return {
    ...report,
    key,
    description: spec.description,
    generatedAt: new Date(),
    generatedBy: `${user.fullName} (${user.role})`,
  };
}

export const reportFilename = (key, ext) =>
  `IDS-${key}-${new Date().toISOString().slice(0, 10)}.${ext}`;
