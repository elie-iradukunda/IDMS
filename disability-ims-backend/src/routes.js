// ─────────────────────────────────────────────────────────────
// routes.js — REST API. Thin handlers; the services hold the rules.
// Permissions attach to roles, not to individuals (Section 2.1.10).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { authenticate, authorize } from './middleware/auth.js';
import * as auth from './services/auth.service.js';
import * as registry from './services/registry.service.js';
import * as support from './services/support.service.js';
import * as reports from './services/reports.service.js';
import * as admin from './services/admin.service.js';

export const router = Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((d) => res.json(d)).catch(next);

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

// ── Officer ──────────────────────────────────────────────────
const asOfficer = authorize('OFFICER');
router.get   ('/registry',                    asOfficer, h((req) => registry.listRegistry(req.query)));
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

// ── Beneficiary (read-only own record; may ask for support) ──
const asBeneficiary = authorize('BENEFICIARY');
router.get   ('/my/profile',       asBeneficiary, h((req) => registry.myProfile(req.user)));
router.get   ('/my/support',       asBeneficiary, h((req) => support.listMine(req.user)));
router.get   ('/my/corrections',   asBeneficiary, h((req) => registry.myCorrections(req.user)));
router.post  ('/my/corrections',   asBeneficiary, h((req) => registry.requestCorrection(req.user, req.body.text)));
router.get   ('/my/notifications', asBeneficiary, h((req) => reports.myNotifications(req.user)));
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
router.get   ('/admin/audit',      asAdmin, h((req) => reports.auditLog(req.query)));

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
router.delete('/admin/users/:id',            asAdmin, h((req) => admin.deleteUser(req.user, +req.params.id)));

// Oversight: the administrator monitors coverage and distribution, so they
// read the registry — they do not gain the officer's authority to change it.
router.get('/admin/registry', asAdmin, h((req) => registry.listRegistry(req.query)));
