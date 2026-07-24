/**
 * Canonical directory of all 51 US jurisdictions (50 states + DC).
 * This drives the state selector and route generation. Full per-state CONTENT
 * (exam rules, questions, process) lives in src/content/states + questions and is
 * layered on top; a state appears in the directory even before its content is authored.
 */
export interface StateDir {
  code: string;
  name: string;
  agencyShort: string;
}

export const STATES: StateDir[] = [
  { code: 'AL', name: 'Alabama', agencyShort: 'ALEA' },
  { code: 'AK', name: 'Alaska', agencyShort: 'DMV' },
  { code: 'AZ', name: 'Arizona', agencyShort: 'MVD' },
  { code: 'AR', name: 'Arkansas', agencyShort: 'OMV' },
  { code: 'CA', name: 'California', agencyShort: 'DMV' },
  { code: 'CO', name: 'Colorado', agencyShort: 'DMV' },
  { code: 'CT', name: 'Connecticut', agencyShort: 'DMV' },
  { code: 'DE', name: 'Delaware', agencyShort: 'DMV' },
  { code: 'DC', name: 'District of Columbia', agencyShort: 'DMV' },
  { code: 'FL', name: 'Florida', agencyShort: 'FLHSMV' },
  { code: 'GA', name: 'Georgia', agencyShort: 'DDS' },
  { code: 'HI', name: 'Hawaii', agencyShort: 'DMV' },
  { code: 'ID', name: 'Idaho', agencyShort: 'ITD' },
  { code: 'IL', name: 'Illinois', agencyShort: 'SOS' },
  { code: 'IN', name: 'Indiana', agencyShort: 'BMV' },
  { code: 'IA', name: 'Iowa', agencyShort: 'DOT' },
  { code: 'KS', name: 'Kansas', agencyShort: 'DOR' },
  { code: 'KY', name: 'Kentucky', agencyShort: 'DDL' },
  { code: 'LA', name: 'Louisiana', agencyShort: 'OMV' },
  { code: 'ME', name: 'Maine', agencyShort: 'BMV' },
  { code: 'MD', name: 'Maryland', agencyShort: 'MVA' },
  { code: 'MA', name: 'Massachusetts', agencyShort: 'RMV' },
  { code: 'MI', name: 'Michigan', agencyShort: 'SOS' },
  { code: 'MN', name: 'Minnesota', agencyShort: 'DVS' },
  { code: 'MS', name: 'Mississippi', agencyShort: 'DPS' },
  { code: 'MO', name: 'Missouri', agencyShort: 'DOR' },
  { code: 'MT', name: 'Montana', agencyShort: 'MVD' },
  { code: 'NE', name: 'Nebraska', agencyShort: 'DMV' },
  { code: 'NV', name: 'Nevada', agencyShort: 'DMV' },
  { code: 'NH', name: 'New Hampshire', agencyShort: 'DMV' },
  { code: 'NJ', name: 'New Jersey', agencyShort: 'MVC' },
  { code: 'NM', name: 'New Mexico', agencyShort: 'MVD' },
  { code: 'NY', name: 'New York', agencyShort: 'DMV' },
  { code: 'NC', name: 'North Carolina', agencyShort: 'DMV' },
  { code: 'ND', name: 'North Dakota', agencyShort: 'DOT' },
  { code: 'OH', name: 'Ohio', agencyShort: 'BMV' },
  { code: 'OK', name: 'Oklahoma', agencyShort: 'DPS' },
  { code: 'OR', name: 'Oregon', agencyShort: 'DMV' },
  { code: 'PA', name: 'Pennsylvania', agencyShort: 'PennDOT' },
  { code: 'RI', name: 'Rhode Island', agencyShort: 'DMV' },
  { code: 'SC', name: 'South Carolina', agencyShort: 'DMV' },
  { code: 'SD', name: 'South Dakota', agencyShort: 'DPS' },
  { code: 'TN', name: 'Tennessee', agencyShort: 'DOS' },
  { code: 'TX', name: 'Texas', agencyShort: 'DPS' },
  { code: 'UT', name: 'Utah', agencyShort: 'DLD' },
  { code: 'VT', name: 'Vermont', agencyShort: 'DMV' },
  { code: 'VA', name: 'Virginia', agencyShort: 'DMV' },
  { code: 'WA', name: 'Washington', agencyShort: 'DOL' },
  { code: 'WV', name: 'West Virginia', agencyShort: 'DMV' },
  { code: 'WI', name: 'Wisconsin', agencyShort: 'DMV' },
  { code: 'WY', name: 'Wyoming', agencyShort: 'DOT' },
];

export const stateSlug = (code: string): string => code.toLowerCase();
export const byCode = (code: string): StateDir | undefined =>
  STATES.find((s) => s.code === code.toUpperCase());
