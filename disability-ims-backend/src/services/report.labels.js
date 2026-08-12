// Human-readable labels for the enum values stored in the database.
//
// A report is read by someone who was not looking at the screen when the
// record was made, so "APPROVED_URGENT" and "alot" have to become words. The
// frontend has its own bilingual copy of these for the UI; this one exists
// because a server-rendered document cannot reach into the browser's
// translator, and an exported spreadsheet full of ENUM constants is a
// spreadsheet somebody has to decode by hand.

export const DISABILITY_LABEL = {
  seeing: 'Seeing',
  hearing: 'Hearing',
  walking: 'Walking / mobility',
  cognition: 'Remembering / concentrating',
  selfcare: 'Self-care',
  communication: 'Communication',
};

export const DIFFICULTY_LABEL = {
  some: 'Some difficulty',
  alot: 'A lot of difficulty',
  cannot: 'Cannot do at all',
};

export const STATUS_LABEL = {
  // Support requests
  REQUESTED: 'Requested',
  APPROVED_URGENT: 'Approved — urgent',
  APPROVED_STANDARD: 'Approved — standard',
  DISTRIBUTING: 'Distributing',
  COMPLETED: 'Completed',
  INELIGIBLE: 'Not eligible',
  CANCELLED: 'Cancelled',
  // Registry records
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
  DECEASED: 'Deceased',
  // Accounts
  INACTIVE: 'Deactivated',
  // Corrections
  PENDING: 'Awaiting review',
  APPLIED: 'Applied to the record',
  DECLINED: 'Reviewed, record unchanged',
  // Opportunity applications
  SUBMITTED: 'Awaiting a decision',
  SHORTLISTED: 'Shortlisted',
  ACCEPTED: 'Accepted',
  WITHDRAWN: 'Withdrawn by the applicant',
};
