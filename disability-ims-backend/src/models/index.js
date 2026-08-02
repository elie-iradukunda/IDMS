// ─────────────────────────────────────────────────────────────
// Sequelize models — Inclusive Disability Support IMS (Kamonyi)
// Mirrors the proposal's data model: the record separates the
// impairment, the daily challenges and the support needs; the
// beneficiary's view is the SAME data under read-only permission.
// ─────────────────────────────────────────────────────────────
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

// ── User (RBAC: OFFICER / BENEFICIARY / PROVIDER / ADMIN) ─────
export const User = sequelize.define('User', {
  id:           { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  fullName:     { type: DataTypes.STRING, allowNull: false },
  email:        { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role:         { type: DataTypes.ENUM('OFFICER', 'BENEFICIARY', 'PROVIDER', 'ADMIN'), allowNull: false },
  status:       { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' }, // deactivated users cannot log in
  sector:       { type: DataTypes.STRING },   // officers: their area
  beneficiaryId:{ type: DataTypes.INTEGER },  // links a BENEFICIARY user to their record
  providerId:   { type: DataTypes.INTEGER },  // links a PROVIDER user to their org
  language:     { type: DataTypes.STRING, defaultValue: 'rw' }, // localisation (Table 6)
  // real, single-use password reset (token stored hashed, never in plaintext)
  resetTokenHash:   { type: DataTypes.STRING },
  resetTokenExpiry: { type: DataTypes.DATE },
});

// ── Provider organisation ────────────────────────────────────
export const Provider = sequelize.define('Provider', {
  id:      { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name:    { type: DataTypes.STRING, allowNull: false },
  type:    { type: DataTypes.STRING },  // NGO, cooperative, employer, donor
  contact: { type: DataTypes.STRING },
});

// ── Beneficiary (the centralised registry record) ────────────
export const Beneficiary = sequelize.define('Beneficiary', {
  id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  code:          { type: DataTypes.STRING, unique: true },     // B-1001
  fullName:      { type: DataTypes.STRING, allowNull: false },
  nationalId:    { type: DataTypes.STRING },                    // sensitive
  sector:        { type: DataTypes.STRING, allowNull: false },
  cell:          { type: DataTypes.STRING },
  village:       { type: DataTypes.STRING },
  guardianName:  { type: DataTypes.STRING },
  email:         { type: DataTypes.STRING },                    // for issued credentials
  dailyChallenges:{ type: DataTypes.TEXT },                    // distinct from impairment
  supportNeeds:  { type: DataTypes.TEXT },                      // distinct from impairment
  verified:      { type: DataTypes.BOOLEAN, defaultValue: false },
  // Lifecycle: a registry that is not maintained decays. ARCHIVED removes a
  // record from active coordination without losing its support history;
  // DECEASED is handled with dignity rather than with an error.
  status:        { type: DataTypes.ENUM('ACTIVE', 'ARCHIVED', 'DECEASED'), defaultValue: 'ACTIVE' },
  consentGiven:  { type: DataTypes.BOOLEAN, defaultValue: false }, // Law 058/2021
  consentAt:     { type: DataTypes.DATE },
  registeredById:{ type: DataTypes.INTEGER },                   // officer
}, { indexes: [{ fields: ['sector'] }, { fields: ['nationalId'] }] });

// ── Impairment rows (Washington Group type + difficulty) ─────
export const Impairment = sequelize.define('Impairment', {
  id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  beneficiaryId: { type: DataTypes.INTEGER, allowNull: false },
  type:          { type: DataTypes.ENUM('seeing', 'hearing', 'walking', 'cognition', 'selfcare', 'communication'), allowNull: false },
  level:         { type: DataTypes.ENUM('some', 'alot', 'cannot'), allowNull: false },
});

// ── Support request / distribution ───────────────────────────
export const SupportRequest = sequelize.define('SupportRequest', {
  id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  code:          { type: DataTypes.STRING, unique: true },      // R-501
  beneficiaryId: { type: DataTypes.INTEGER, allowNull: false },
  need:          { type: DataTypes.STRING, allowNull: false },
  // Who initiated it. BENEFICIARY matters because a person must be able to
  // ask for what they need; OFFICER matters because a request-driven system
  // otherwise serves only those already able to make a request.
  origin:        { type: DataTypes.ENUM('OFFICER', 'PROVIDER', 'BENEFICIARY'), allowNull: false },
  providerId:    { type: DataTypes.INTEGER },
  status:        { type: DataTypes.ENUM('REQUESTED', 'APPROVED_URGENT', 'APPROVED_STANDARD', 'DISTRIBUTING', 'COMPLETED', 'INELIGIBLE', 'CANCELLED'), defaultValue: 'REQUESTED' },
  decisionReason:{ type: DataTypes.TEXT },     // required on any officer decision
  decidedById:   { type: DataTypes.INTEGER },
  completedAt:   { type: DataTypes.DATE },
}, { indexes: [{ fields: ['status'] }, { fields: ['beneficiaryId'] }] });

// ── Timeline events (support history, shown to beneficiary) ──
export const RequestEvent = sequelize.define('RequestEvent', {
  id:        { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  requestId: { type: DataTypes.INTEGER, allowNull: false },
  label:     { type: DataTypes.STRING, allowNull: false },
  actorId:   { type: DataTypes.INTEGER },
});

// ── Correction requests (beneficiary → officer) ──────────────
export const Correction = sequelize.define('Correction', {
  id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  beneficiaryId: { type: DataTypes.INTEGER, allowNull: false },
  text:          { type: DataTypes.TEXT, allowNull: false },
  status:        { type: DataTypes.ENUM('PENDING', 'APPLIED', 'DECLINED'), defaultValue: 'PENDING' },
  handledById:   { type: DataTypes.INTEGER },
});

// ── Opportunities & announcements ────────────────────────────
export const Opportunity = sequelize.define('Opportunity', {
  id:         { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  kind:       { type: DataTypes.ENUM('scholarship', 'job', 'training', 'announcement'), allowNull: false },
  title:      { type: DataTypes.STRING, allowNull: false },
  org:        { type: DataTypes.STRING },
  detail:     { type: DataTypes.TEXT },
  postedById: { type: DataTypes.INTEGER },
});

// ── Notifications ────────────────────────────────────────────
export const Notification = sequelize.define('Notification', {
  id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  beneficiaryId: { type: DataTypes.INTEGER }, // notifications target a beneficiary record
  icon:          { type: DataTypes.STRING, defaultValue: '🔔' },
  message:       { type: DataTypes.STRING, allowNull: false },
  read:          { type: DataTypes.BOOLEAN, defaultValue: false },
});

// ── Audit log (every access/change to sensitive data) ────────
export const AuditLog = sequelize.define('AuditLog', {
  id:        { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  actorId:   { type: DataTypes.INTEGER },
  actorName: { type: DataTypes.STRING, defaultValue: 'System' },
  action:    { type: DataTypes.STRING, allowNull: false },
  entity:    { type: DataTypes.STRING },
  meta:      { type: DataTypes.JSON },
}, { updatedAt: false });

// ── Counter (atomic B-/R- codes) ─────────────────────────────
export const Counter = sequelize.define('Counter', {
  key:   { type: DataTypes.STRING, primaryKey: true },
  value: { type: DataTypes.INTEGER, defaultValue: 0 },
}, { timestamps: false });

// ── Associations ─────────────────────────────────────────────
Beneficiary.hasMany(Impairment, { foreignKey: 'beneficiaryId', as: 'impairments', onDelete: 'CASCADE' });
Impairment.belongsTo(Beneficiary, { foreignKey: 'beneficiaryId' });

Beneficiary.hasMany(SupportRequest, { foreignKey: 'beneficiaryId', as: 'requests' });
SupportRequest.belongsTo(Beneficiary, { foreignKey: 'beneficiaryId', as: 'beneficiary' });
Provider.hasMany(SupportRequest, { foreignKey: 'providerId' });
SupportRequest.belongsTo(Provider, { foreignKey: 'providerId', as: 'provider' });

SupportRequest.hasMany(RequestEvent, { foreignKey: 'requestId', as: 'timeline', onDelete: 'CASCADE' });
RequestEvent.belongsTo(SupportRequest, { foreignKey: 'requestId' });

Beneficiary.hasMany(Correction, { foreignKey: 'beneficiaryId', as: 'corrections' });
Correction.belongsTo(Beneficiary, { foreignKey: 'beneficiaryId', as: 'beneficiary' });

Beneficiary.hasMany(Notification, { foreignKey: 'beneficiaryId' });
Notification.belongsTo(Beneficiary, { foreignKey: 'beneficiaryId' });

Opportunity.belongsTo(User, { foreignKey: 'postedById', as: 'author' });

User.belongsTo(Beneficiary, { foreignKey: 'beneficiaryId' });
User.belongsTo(Provider, { foreignKey: 'providerId' });

export { sequelize };
