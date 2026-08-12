// Brand tokens shared by the Excel and PDF renderers, so an exported
// workbook and an exported document are recognisably the same system as the
// screen they came from. These mirror the CSS variables in the frontend's
// index.css — green brand, slate surfaces.

export const BRAND = {
  green: '087536',
  greenDark: '075126',
  greenSoft: 'EBF8F0',
  ink: '0F172A',
  muted: '64748B',
  border: 'E2E8F0',
  surfaceAlt: 'F8FAFC',
  white: 'FFFFFF',
  amber: 'B45309',
};

// PDFKit wants #rrggbb; ExcelJS wants AARRGGBB.
export const hex = (c) => `#${c}`;
export const argb = (c) => `FF${c}`;

export const ORG = {
  name: 'Disability Support IMS',
  subtitle: 'Inclusive registry & support coordination',
  district: 'Kamonyi District, Rwanda',
  mark: 'IDS',
};

// The confidentiality line that belongs on anything carrying registry data.
// Disability status is sensitive personal data under Law No. 058/2021, and a
// spreadsheet emailed onward is exactly how that protection quietly lapses.
export const CONFIDENTIALITY =
  'Confidential. This document contains personal data relating to persons with disabilities and is '
  + 'protected under Law No. 058/2021 on the protection of personal data and privacy. Share it only '
  + 'with people entitled to see it, and delete copies you no longer need.';
