// ─────────────────────────────────────────────────────────────
// routes.js — REST API. Thin handlers; the services hold the rules.
// Permissions attach to roles, not to individuals (Section 2.1.10).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate, authorize } from './middleware/auth.js';
import * as auth from './services/auth.service.js';
import * as registry from './services/registry.service.js';
import { AppError } from './services/registry.service.js';
import * as support from './services/support.service.js';
import * as reports from './services/reports.service.js';
import * as admin from './services/admin.service.js';
import * as applications from './services/application.service.js';
import * as reporting from './services/report.service.js';
import { renderXlsx } from './services/report.xlsx.js';
import { renderPdf } from './services/report.pdf.js';

export const router = Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((d) => res.json(d)).catch(next);

// Paged list handler. The service returns { rows, total }; the response body
// stays a plain array so every existing client keeps working, and the full
// match count travels in X-Total-Count for the ones that page.
const hList = (fn) => (req, res, next) => Promise.resolve(fn(req, res))
  .then(({ rows, total }) => { res.set('X-Total-Count', String(total)); res.json(rows); })
  .catch(next);

// ── Public ───────────────────────────────────────────────────
router.post('/auth/login',           h((req) => auth.login(req.body)));
router.post('/auth/forgot-password', h((req) => auth.forgotPassword(req.body)));
router.post('/auth/reset-password',  h((req) => auth.resetPassword(req.body)));

router.use(authenticate);

// ── Shared ───────────────────────────────────────────────────
router.get ('/me',              h((req) => ({ id: req.user.id, fullName: req.user.fullName, email: req.user.email, role: req.user.role, sector: req.user.sector, beneficiaryId: req.user.beneficiaryId, providerId: req.user.providerId, language: req.user.language })));
router.post('/me/password',     h((req) => auth.changePassword(req.user, req.body)));
router.post('/me/language',     h((req) => auth.setLanguage(req.user, req.body.language)));
router.get ('/opportunities',   h(() => reports.listOpportunities()));

// ── Reports ──────────────────────────────────────────────────
// Every role can export what it is entitled to see, and only that: the
// catalogue is filtered by role and each builder re-derives its own scope
// from the authenticated user rather than trusting a query parameter.
router.get('/reports', h((req) => ({ reports: reporting.catalogue(req.user) })));

// Preview the report on screen before committing to a download — a 4,000-row
// audit export is a slow thing to discover you did not want.
router.get('/reports/:key/preview', h(async (req) => {
  const r = await reporting.build(req.user, req.params.key, req.query);
  return {
    key: r.key, title: r.title, subtitle: r.subtitle, description: r.description,
    generatedAt: r.generatedAt, generatedBy: r.generatedBy,
    meta: r.meta || [], narrative: r.narrative || [], summary: r.summary || [], notes: r.notes || [],
    sheets: r.sheets.map((s) => ({
      name: s.name,
      columns: s.columns.map((c) => c.header),
      rowCount: s.rows.length,
      // Enough to see the shape of it without shipping the whole dataset twice.
      sample: s.rows.slice(0, 5).map((row) => s.columns.map((c) => {
        const v = row[c.key];
        return v === null || v === undefined ? '' : String(v);
      })),
    })),
  };
}));

// Two shapes for the same download. `/reports/:key/pdf` reads well for an API
// consumer, but Edge's bundled PDF extension intercepts requests whose URL
// ends in that segment — even ones issued by fetch() — swallowing the body and
// leaving the page with an empty 204. The browser therefore asks by query
// parameter instead, where no extension is watching.
const downloadReport = async (req, res, next) => {
  try {
    const key = req.params.key;
    const format = req.params.format || req.query.format;
    if (!['xlsx', 'pdf'].includes(format)) throw new AppError(400, 'Format must be xlsx or pdf');

    const report = await reporting.build(req.user, key, req.query);
    const filename = reporting.reportFilename(key, format);
    const body = format === 'xlsx' ? await renderXlsx(report) : await renderPdf(report);

    const mime = format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';

    // Edge's bundled PDF handler claims any response whose body begins "%PDF"
    // — even one being read by fetch(), and even with Content-Type
    // application/octet-stream and X-Content-Type-Options: nosniff. The plugin
    // takes the body and the page is left holding an empty 204, so a PDF
    // report saved as a 0-byte file. Wrapping the bytes in JSON puts them
    // somewhere no content handler is looking; the browser rebuilds the blob
    // and names the file itself. Direct API consumers keep the raw stream.
    if (req.query.encoding === 'base64') {
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ filename, mime, size: Buffer.byteLength(body), data: Buffer.from(body).toString('base64') });
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('X-Report-Filename', filename);
    // The filename travels in the header, so the browser must be allowed to
    // read it back when the download is fetched with an Authorization header.
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Report-Filename, X-Total-Count');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.setHeader('Cache-Control', 'no-store');   // it contains personal data
    return res.end(Buffer.from(body));
  } catch (e) {
    next(e);
  }
};

router.get('/reports/:key/download', downloadReport);   // ?format=xlsx|pdf — used by the web app
router.get('/reports/:key/:format', downloadReport);    // /xlsx | /pdf     — convenient for scripts

// ── Officer ──────────────────────────────────────────────────
const asOfficer = authorize('OFFICER');
router.get   ('/officer/overview',            asOfficer, h((req) => reports.officerOverview(req.user)));
router.get   ('/officer/badges',              asOfficer, h(() => reports.officerBadges()));
router.get   ('/registry',                    asOfficer, hList((req) => registry.listRegistry(req.query)));
router.get   ('/registry/:id',                asOfficer, h((req) => registry.getBeneficiary(+req.params.id)));
router.post  ('/registry',                    asOfficer, h((req) => registry.registerBeneficiary(req.user, req.body)));
router.post  ('/registry/check-duplicate',    asOfficer, h((req) => registry.findDuplicates(req.body)));
router.patch ('/registry/:id',                asOfficer, h((req) => registry.updateBeneficiary(req.user, +req.params.id, req.body)));
router.post  ('/registry/:id/status',         asOfficer, h((req) => registry.setBeneficiaryStatus(req.user, +req.params.id, req.body.status)));
router.delete('/registry/:id',                asOfficer, h((req) => registry.setBeneficiaryStatus(req.user, +req.params.id, 'ARCHIVED')));

// Impairments — a record whose impairment list cannot be corrected goes stale.
router.post  ('/registry/:id/impairments', asOfficer, h((req) => registry.addImpairment(req.user, +req.params.id, req.body)));
router.patch ('/impairments/:id',          asOfficer, h((req) => registry.updateImpairment(req.user, +req.params.id, req.body)));
router.delete('/impairments/:id',          asOfficer, h((req) => registry.deleteImpairment(req.user, +req.params.id)));

router.get   ('/corrections',                 asOfficer, h((req) => registry.listCorrections(req.query.status || 'PENDING')));
router.post  ('/corrections/:id/resolve',     asOfficer, h((req) => registry.resolveCorrection(req.user, +req.params.id, !!req.body.apply, req.body.patch || {})));

router.get   ('/support/requests',            asOfficer, h((req) => support.listAll(req.query)));
router.patch ('/support/requests/:id',        asOfficer, h((req) => support.updateRequest(req.user, +req.params.id, req.body)));
router.post  ('/support/requests/:id/decide', asOfficer, h((req) => support.decide(req.user, +req.params.id, req.body.decision, req.body.reason)));
router.post  ('/support/requests/:id/distribute', asOfficer, h((req) => support.startDistribution(req.user, +req.params.id)));
router.post  ('/support/requests/:id/complete',   asOfficer, h((req) => support.complete(req.user, +req.params.id)));

// A request may be initiated by an officer, a provider or the beneficiary
// themselves — the origin is derived from the role, never from the body.
router.post('/support/requests', authorize('OFFICER', 'PROVIDER', 'BENEFICIARY'), h((req) => support.createRequest(req.user, req.body)));
// Whoever raised it may withdraw it while it is still awaiting a decision.
router.post('/support/requests/:id/cancel', authorize('OFFICER', 'PROVIDER', 'BENEFICIARY'), h((req) => support.cancelRequest(req.user, +req.params.id)));

// Officers, providers and admins may publish, edit and remove opportunities they own.
router.post  ('/opportunities',     authorize('OFFICER', 'PROVIDER', 'ADMIN'), h((req) => reports.publishOpportunity(req.user, req.body)));
router.patch ('/opportunities/:id', authorize('OFFICER', 'PROVIDER', 'ADMIN'), h((req) => reports.updateOpportunity(req.user, +req.params.id, req.body)));
router.delete('/opportunities/:id', authorize('OFFICER', 'PROVIDER', 'ADMIN'), h((req) => reports.deleteOpportunity(req.user, +req.params.id)));

// ── Applying to an opportunity ───────────────────────────────
// Publishing without a way to respond only moves the exclusion one step
// later, so an opportunity is something a beneficiary can act on. A
// beneficiary applies for themselves; an officer may apply on behalf of
// someone who cannot use the form, has no email, or has no device.
router.post('/opportunities/:id/apply', authorize('BENEFICIARY', 'OFFICER'),
  h((req) => applications.apply(req.user, +req.params.id, req.body)));
router.post('/applications/:id/withdraw', authorize('BENEFICIARY', 'OFFICER'),
  h((req) => applications.withdraw(req.user, +req.params.id)));
router.get ('/my/applications', authorize('BENEFICIARY'),
  h((req) => applications.mine(req.user)));

// Review: the publisher, any officer, or an administrator. A provider sees
// applications to their own postings only.
router.get ('/opportunities/:id/applications', authorize('OFFICER', 'PROVIDER', 'ADMIN'),
  h((req) => applications.listForOpportunity(req.user, +req.params.id)));
router.get ('/applications/pending', authorize('OFFICER', 'PROVIDER', 'ADMIN'),
  h((req) => applications.pending(req.user)));
router.post('/applications/:id/decide', authorize('OFFICER', 'PROVIDER', 'ADMIN'),
  h((req) => applications.decide(req.user, +req.params.id, req.body.status, req.body.reason)));

// ── Beneficiary (read-only own record; may ask for support) ──
const asBeneficiary = authorize('BENEFICIARY');
router.get   ('/my/profile',       asBeneficiary, h((req) => registry.myProfile(req.user)));
router.get   ('/my/support',       asBeneficiary, h((req) => support.listMine(req.user)));
router.get   ('/my/corrections',   asBeneficiary, h((req) => registry.myCorrections(req.user)));
router.post  ('/my/corrections',   asBeneficiary, h((req) => registry.requestCorrection(req.user, req.body.text)));
router.get   ('/my/notifications', asBeneficiary, h((req) => reports.myNotifications(req.user)));
router.get   ('/my/notifications/unread-count', asBeneficiary, h((req) => reports.myUnreadCount(req.user)));
router.post  ('/my/notifications/:id/read', asBeneficiary, h((req) => reports.markRead(req.user, +req.params.id)));
router.post  ('/my/notifications/read-all', asBeneficiary, h((req) => reports.markAllRead(req.user)));
router.delete('/my/notifications/:id',      asBeneficiary, h((req) => reports.deleteNotification(req.user, +req.params.id)));

// ── Provider (limited fields only) ───────────────────────────
const asProvider = authorize('PROVIDER');
router.get('/provider/search', asProvider, h((req) => support.providerSearch(req.query)));
router.get('/provider/offers', asProvider, h((req) => support.listProviderOffers(req.user)));

// ── Admin ────────────────────────────────────────────────────
const asAdmin = authorize('ADMIN');
router.get   ('/admin/reports',    asAdmin, h(() => reports.reports()));
router.get   ('/admin/audit',      asAdmin, hList((req) => reports.auditLog(req.query)));

// Provider organisations (full CRUD) — a provider account cannot exist
// without an organisation for it to belong to.
router.get   ('/admin/providers',     asAdmin, h(() => admin.listProviders()));
router.post  ('/admin/providers',     asAdmin, h((req) => admin.createProvider(req.user, req.body)));
router.patch ('/admin/providers/:id', asAdmin, h((req) => admin.updateProvider(req.user, +req.params.id, req.body)));
router.delete('/admin/providers/:id', asAdmin, h((req) => admin.deleteProvider(req.user, +req.params.id)));

// User & role management (full CRUD)
router.get   ('/admin/users',                asAdmin, h(() => reports.listUsers()));
router.post  ('/admin/users',                asAdmin, h((req) => admin.createUser(req.user, req.body)));
router.patch ('/admin/users/:id',            asAdmin, h((req) => admin.updateUser(req.user, +req.params.id, req.body)));
router.post  ('/admin/users/:id/reset-password', asAdmin, h((req) => admin.resetUserPassword(req.user, +req.params.id)));
router.post  ('/admin/users/:id/invite',     asAdmin, h((req) => admin.inviteUser(req.user, +req.params.id)));
router.delete('/admin/users/:id',            asAdmin, h((req) => admin.deleteUser(req.user, +req.params.id)));

// Oversight: the administrator monitors coverage and distribution, so they
// read the registry — they do not gain the officer's authority to change it.
router.get('/admin/registry', asAdmin, hList((req) => registry.listRegistry(req.query)));
