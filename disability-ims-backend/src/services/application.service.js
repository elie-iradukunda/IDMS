// ─────────────────────────────────────────────────────────────
// application.service.js — applying to an opportunity.
//
// The problem this closes. Objective 4 got as far as *publishing*
// scholarships, jobs and training to every registered beneficiary, which
// fixed the distribution failure: the information now travels. But a person
// who reads "Bursary for students with disabilities — apply by 30 August" and
// has no way to say "me" is no better served than before. The information
// reached them; the opportunity did not. Publishing without a way to respond
// simply moves the exclusion one step later.
//
// Three rules carry over from the support-request workflow, because they are
// what makes that workflow fair and the same reasoning applies here:
//
//  1. THREE ORIGINS, NOT ONE. A beneficiary applies for themselves; an
//     officer may apply on their behalf. The person who cannot read the form,
//     has no email or has no device is precisely the person an opportunity is
//     least likely to reach, and a self-service-only system quietly selects
//     for literacy and connectivity — the two things a rural disability
//     registry cannot assume.
//
//  2. EVERY DECISION CARRIES A RECORDED REASON, shown to the applicant. An
//     outcome nobody has to justify is indistinguishable, from the person who
//     was refused, from an arbitrary one.
//
//  3. EVERY STEP IS AUDITED AND NOTIFIED. Silence after an application is
//     what teaches people not to bother applying again.
// ─────────────────────────────────────────────────────────────
import { Op } from 'sequelize';
import {
  sequelize, Opportunity, OpportunityApplication, Beneficiary, User,
} from '../models/index.js';
import { AppError, audit, notify, afterCommit, officerFor } from './registry.service.js';
import { sendApplicationReceived, sendApplicationDecision } from './notify.js';

const bad = (m) => { throw new AppError(400, m); };
const forbid = (m) => { throw new AppError(403, m); };
const notFound = (m) => { throw new AppError(404, m); };

const DECISIONS = {
  SHORTLISTED: 'shortlisted for the next stage',
  ACCEPTED: 'accepted',
  DECLINED: 'not selected',
};

// An announcement carries no places to compete for. A closing date that has
// passed closes the opportunity for everyone equally — which is the point of
// publishing one.
export function applicationWindow(o) {
  if (!o.acceptsApplications || o.kind === 'announcement') {
    return { open: false, reason: 'This is an announcement, not an opportunity you apply to' };
  }
  if (o.deadline) {
    // DATEONLY: the deadline day itself is still open, up to its last moment.
    const closesAfter = new Date(`${o.deadline}T23:59:59`);
    if (closesAfter < new Date()) return { open: false, reason: `Applications closed on ${o.deadline}` };
  }
  return { open: true };
}

const withBeneficiary = {
  model: Beneficiary, as: 'beneficiary',
  attributes: ['id', 'code', 'fullName', 'sector', 'cell', 'village', 'supportNeeds', 'email', 'status'],
};

// ══════════════════════════════════════════════════════════════
// APPLY
// ══════════════════════════════════════════════════════════════
export async function apply(user, opportunityId, { note, beneficiaryId } = {}) {
  const o = await Opportunity.findByPk(opportunityId);
  if (!o) notFound('Opportunity not found');

  const window = applicationWindow(o);
  if (!window.open) bad(window.reason);

  // A beneficiary may only ever apply for themselves. An officer applies on
  // behalf of someone they name — that is the whole point of the second path.
  const isOfficer = user.role === 'OFFICER';
  if (!isOfficer && user.role !== 'BENEFICIARY') forbid('Only a beneficiary or their officer can apply');
  if (!isOfficer && !user.beneficiaryId) forbid('No beneficiary record is linked to this account');
  const targetId = isOfficer ? beneficiaryId : user.beneficiaryId;
  if (!targetId) bad('Choose the beneficiary you are applying on behalf of');

  const b = await Beneficiary.findByPk(targetId);
  if (!b) notFound('Beneficiary not found');
  if (b.status !== 'ACTIVE') bad(`Cannot apply for a record that is ${b.status.toLowerCase()}`);

  const already = await OpportunityApplication.findOne({
    where: { opportunityId: o.id, beneficiaryId: b.id },
  });
  if (already) {
    // Re-applying after withdrawing is legitimate — changing your mind is not
    // a mistake. Re-applying while an application is live is.
    if (already.status !== 'WITHDRAWN') bad('An application for this opportunity already exists');
    await already.update({
      status: 'SUBMITTED', note: note?.trim() || already.note,
      origin: isOfficer ? 'OFFICER' : 'BENEFICIARY', submittedById: user.id,
      decisionReason: null, decidedById: null, decidedAt: null,
    });
    return reload(already.id);
  }

  const created = await sequelize.transaction(async (t) => {
    const a = await OpportunityApplication.create({
      opportunityId: o.id, beneficiaryId: b.id, note: note?.trim() || null,
      origin: isOfficer ? 'OFFICER' : 'BENEFICIARY', submittedById: user.id, status: 'SUBMITTED',
    }, { transaction: t });

    await audit(t, {
      actorId: user.id, actorName: user.fullName,
      action: isOfficer
        ? `Applied on behalf of ${b.code} to "${o.title}"`
        : `${b.code} applied to "${o.title}"`,
      entity: `OpportunityApplication:${a.id}`,
      meta: { opportunity: o.title, kind: o.kind, origin: isOfficer ? 'OFFICER' : 'BENEFICIARY' },
    });

    // The beneficiary is told either way — including when an officer did it
    // for them, so being helped never means being kept in the dark.
    await notify(t, b.id, '📨', isOfficer
      ? `Your officer applied for you: ${o.title}`
      : `Your application was submitted: ${o.title}`);
    return a;
  });

  afterCommit(async () => {
    // The person who published it needs to know somebody responded; otherwise
    // an application sits in a table nobody opens.
    const publisher = o.postedById ? await User.findByPk(o.postedById) : null;
    const recipient = publisher?.status === 'ACTIVE' ? publisher : await officerFor(b);
    if (recipient?.email) {
      await sendApplicationReceived({
        to: recipient.email, title: o.title, kind: o.kind,
        beneficiary: b.fullName, code: b.code, sector: b.sector,
        note: note?.trim(), onBehalf: isOfficer,
      });
    }
  });

  return reload(created.id);
}

const reload = (id) => OpportunityApplication.findByPk(id, {
  include: [withBeneficiary, { model: Opportunity, as: 'opportunity' }],
});

// ══════════════════════════════════════════════════════════════
// WITHDRAW — while it is still undecided
// ══════════════════════════════════════════════════════════════
export async function withdraw(user, id) {
  const a = await OpportunityApplication.findByPk(id);
  if (!a) notFound('Application not found');
  if (user.role === 'BENEFICIARY' && a.beneficiaryId !== user.beneficiaryId) {
    forbid('You can only withdraw your own application');
  }
  if (user.role !== 'BENEFICIARY' && user.role !== 'OFFICER') forbid('You do not have access to this action');
  if (!['SUBMITTED', 'SHORTLISTED'].includes(a.status)) {
    bad('Only an application that has not been decided can be withdrawn');
  }

  return sequelize.transaction(async (t) => {
    const o = await Opportunity.findByPk(a.opportunityId, { transaction: t });
    await a.update({ status: 'WITHDRAWN' }, { transaction: t });
    await audit(t, {
      actorId: user.id, actorName: user.fullName,
      action: `Withdrew application to "${o?.title}"`, entity: `OpportunityApplication:${a.id}`,
    });
    await notify(t, a.beneficiaryId, 'ℹ️', `Your application was withdrawn: ${o?.title}`);
    return a;
  }).then(() => reload(a.id));
}

// ══════════════════════════════════════════════════════════════
// DECIDE — with a reason the applicant will read
// ══════════════════════════════════════════════════════════════
export async function decide(user, id, status, reason) {
  if (!DECISIONS[status]) bad('Decision must be SHORTLISTED, ACCEPTED or DECLINED');
  if (!reason?.trim()) bad('A reason is required and is shown to the applicant');

  const a = await OpportunityApplication.findByPk(id);
  if (!a) notFound('Application not found');
  const o = await Opportunity.findByPk(a.opportunityId);
  if (!o) notFound('Opportunity not found');
  assertCanReview(user, o);
  if (a.status === 'WITHDRAWN') bad('This application was withdrawn by the applicant');
  if (['ACCEPTED', 'DECLINED'].includes(a.status)) bad(`This application was already ${a.status.toLowerCase()}`);

  const out = await sequelize.transaction(async (t) => {
    await a.update({
      status, decisionReason: reason.trim(), decidedById: user.id, decidedAt: new Date(),
    }, { transaction: t });

    const b = await Beneficiary.findByPk(a.beneficiaryId, { transaction: t });
    await audit(t, {
      actorId: user.id, actorName: user.fullName,
      action: `Application to "${o.title}" by ${b?.code} → ${status}`,
      entity: `OpportunityApplication:${a.id}`, meta: { reason: reason.trim() },
    });

    const icon = { ACCEPTED: '🎉', SHORTLISTED: '📋', DECLINED: 'ℹ️' }[status];
    await notify(t, a.beneficiaryId, icon,
      status === 'DECLINED'
        ? `Not selected for ${o.title}. Reason: ${reason.trim()}`
        : `${status === 'ACCEPTED' ? 'You were accepted' : 'You were shortlisted'}: ${o.title}`);

    return { email: b?.email, name: b?.fullName };
  });

  if (out.email) {
    afterCommit(() => sendApplicationDecision({
      to: out.email, name: out.name, title: o.title, kind: o.kind,
      status, reason: reason.trim(), org: o.org,
    }));
  }
  return reload(a.id);
}

// Who may read and decide applications to a given opportunity: the person who
// published it, any officer (the district coordinates support), or an
// administrator. A provider sees applications to their OWN postings only —
// they must not gain a roster of beneficiaries through the back door.
function assertCanReview(user, o) {
  if (user.role === 'ADMIN' || user.role === 'OFFICER') return;
  if (o.postedById === user.id) return;
  forbid('You can only review applications to opportunities you published');
}

// ══════════════════════════════════════════════════════════════
// READS
// ══════════════════════════════════════════════════════════════

// The beneficiary's own applications, with the outcome and the reason.
export async function mine(user) {
  if (!user.beneficiaryId) forbid('No beneficiary record is linked to this account');
  return OpportunityApplication.findAll({
    where: { beneficiaryId: user.beneficiaryId },
    include: [{ model: Opportunity, as: 'opportunity' }],
    order: [['createdAt', 'DESC']],
  });
}

// Applicants to one opportunity, for whoever may review it.
export async function listForOpportunity(user, opportunityId) {
  const o = await Opportunity.findByPk(opportunityId);
  if (!o) notFound('Opportunity not found');
  assertCanReview(user, o);
  return OpportunityApplication.findAll({
    where: { opportunityId },
    include: [withBeneficiary],
    // Undecided first, then oldest first: the longest wait is the one that has
    // done the most harm. The column must be qualified — Beneficiary is joined
    // in and carries a `status` of its own, so a bare `status` is ambiguous.
    order: [
      [sequelize.literal("FIELD(`OpportunityApplication`.`status`,'SUBMITTED','SHORTLISTED','ACCEPTED','DECLINED','WITHDRAWN')"), 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });
}

// Everything awaiting a decision, across every opportunity the user may
// review — so a queue is visible without opening each posting in turn.
export async function pending(user) {
  const where = (user.role === 'ADMIN' || user.role === 'OFFICER') ? {} : { postedById: user.id };
  const owned = await Opportunity.findAll({ where, attributes: ['id'] });
  if (!owned.length) return [];
  return OpportunityApplication.findAll({
    where: { opportunityId: { [Op.in]: owned.map((o) => o.id) }, status: { [Op.in]: ['SUBMITTED', 'SHORTLISTED'] } },
    include: [withBeneficiary, { model: Opportunity, as: 'opportunity' }],
    order: [['createdAt', 'ASC']],
  });
}
