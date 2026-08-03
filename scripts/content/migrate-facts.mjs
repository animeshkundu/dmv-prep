#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib/content-io.mjs';

const DEFAULT_STATES_DIR = join(ROOT, 'src/content/states');

function valueState(value, conditions) {
  return { status: 'value', value, ...(conditions?.length ? { conditions } : {}) };
}

function unknownState(text) {
  return { status: 'unknown', reason: String(text) };
}

function singleMatch(text, expression, mapper = (match) => Number(match[1])) {
  if (typeof text !== 'string') return undefined;
  const matches = [...text.matchAll(new RegExp(expression.source, expression.flags.includes('g') ? expression.flags : `${expression.flags}g`))];
  if (matches.length !== 1) return undefined;
  return mapper(matches[0]);
}

function parsePercent(value) {
  const parsed = singleMatch(value, /\b(0(?:\.\d+)?)\s*%/);
  return parsed !== undefined && parsed >= 0 && parsed <= 0.2 ? parsed : undefined;
}

function parseMph(value) {
  const mph = singleMatch(value, /\b(\d{1,3})\s*mph\b/i);
  if (!Number.isInteger(mph) || mph < 5 || mph > 90) return undefined;
  const condition = /\(([^()]+)\)/.exec(value)?.[1] ?? /\b(?:when|where|if)\s+(.+)$/i.exec(value)?.[0];
  return { value: mph, conditions: condition ? [{ kind: 'posting', detail: condition.trim() }] : undefined };
}

function parseMonths(value) {
  const months = singleMatch(value, /\b(\d+)\s*months?\b/i);
  return Number.isInteger(months) && months >= 0 ? months : undefined;
}

function parseHours(value) {
  const hours = singleMatch(value, /\b(\d+)\s*hours?\b/i);
  return Number.isInteger(hours) && hours >= 0 ? hours : undefined;
}

function parseAgeMonths(value) {
  if (typeof value !== 'string') return undefined;
  const yearsAndMonths = /^\s*(\d+)\s*(?:years?|yrs?)\s*(\d+)\s*(?:months?|mos?)\s*$/i.exec(value);
  if (yearsAndMonths) {
    const years = Number(yearsAndMonths[1]);
    const months = Number(yearsAndMonths[2]);
    if (months < 12) return years * 12 + months;
  }
  const years = singleMatch(value, /^\s*(\d+)\s*(?:years?|yrs?)(?:\s+old)?\s*$/i);
  return Number.isInteger(years) ? years * 12 : undefined;
}

function parseBoolean(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function parsePointSuspension(value) {
  if (typeof value !== 'string') return undefined;
  const match = /^\s*(\d+)\s*points?\s+(?:within|in)\s+(\d+)\s*months?\s*$/i.exec(value);
  return match ? { points: Number(match[1]), windowMonths: Number(match[2]) } : undefined;
}

function parseMoveOver(value) {
  if (typeof value !== 'string') return undefined;
  const text = value.toLowerCase();
  if (!/\bmove over\b/.test(text)) return undefined;
  const requirement = /\bmove over\b[\s\S]{0,30}\b(?:or|and)\s+slow(?:\s+down)?\b/.test(text)
    ? 'lane-change-or-slow'
    : /\bmove over\b[\s\S]{0,30}\brequired\b/.test(text)
      ? 'lane-change-required'
      : undefined;
  if (!requirement) return undefined;

  const coveredVehicles = [
    ...(/\bemergency\b/.test(text) ? ['emergency'] : []),
    ...(/\btow\b/.test(text) ? ['tow'] : []),
    ...(/\broadside[-\s]assist/.test(text) ? ['roadside-assist'] : []),
    ...(/\butility\b/.test(text) ? ['utility'] : []),
  ];
  return coveredVehicles.length ? { requirement, coveredVehicles } : undefined;
}

function parseCurfew(value) {
  if (typeof value !== 'string') return undefined;
  const match = /^\s*(?:no driving\s+)?(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\s*[-–]\s*(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)(.*)$/i.exec(value);
  if (!match) return undefined;
  const toHour24 = (hour, suffix) => {
    const normalized = suffix.replace(/\./g, '').toLowerCase();
    const base = Number(hour);
    if (base < 1 || base > 12) return undefined;
    return normalized === 'am' ? base % 12 : (base % 12) + 12;
  };
  const startHour24 = toHour24(match[1], match[2]);
  const endHour24 = toHour24(match[3], match[4]);
  if (startHour24 === undefined || endHour24 === undefined) return undefined;
  const detail = match[5].replace(/^[\s,;]+/, '').trim();
  return { value: { startHour24, endHour24 }, conditions: detail ? [{ kind: 'gdl-phase', detail }] : undefined };
}

const LEGACY_FACTS = [
  ['bacLimitAdult', 'bacAdult', parsePercent],
  ['bacLimitUnder21', 'bacUnder21', parsePercent],
  ['bacLimitCommercial', 'bacCommercial', parsePercent],
  ['pointSystem', 'pointSystem', parseBoolean],
  ['pointSuspensionThreshold', 'pointSuspension', parsePointSuspension],
  ['moveOverRule', 'moveOver', parseMoveOver],
  ['interstateMaxSpeed', 'ruralInterstateMaxMph', parseMph],
  ['schoolZoneSpeed', 'schoolZoneMph', parseMph],
];

const LEGACY_GDL_FACTS = [
  ['permitMinAge', 'permitMinAgeMonths', parseAgeMonths],
  ['permitHoldingPeriod', 'permitHoldingMonths', parseMonths],
  ['supervisedHoursRequired', 'supervisedHoursTotal', parseHours],
  ['nightHoursRequired', 'supervisedHoursNight', parseHours],
  ['nightCurfew', 'gdlNightCurfew', parseCurfew],
];

export function migrateLegacyValue(raw, parser) {
  const parsed = parser(raw);
  if (parsed === undefined) return unknownState(raw);
  if (typeof parsed === 'object' && parsed !== null && 'value' in parsed) {
    return valueState(parsed.value, parsed.conditions);
  }
  return valueState(parsed);
}

function factRecord(raw, parser, citation, lastVerified) {
  const state = migrateLegacyValue(raw, parser);
  return {
    state,
    display: String(raw),
    citation,
    lastVerified,
    confidence: state.status === 'value' ? 'inferred' : 'unknown',
  };
}

/**
 * Convert only legacy values that are unambiguous. Ambiguous strings retain
 * their exact legacy text as an unknown fact; no migrated fact is "verified".
 */
export function migrateStateFacts(state) {
  const citation = state.references?.[0];
  if (!citation) throw new Error(`${state.code ?? 'state'} has legacy facts but no existing citation to retain`);
  const lastVerified = state.lastVerified;
  if (typeof lastVerified !== 'string') throw new Error(`${state.code ?? 'state'} has legacy facts but no lastVerified date to retain`);

  const typedFacts = { ...(state.typedFacts ?? {}) };
  for (const [legacyKey, typedKey, parser] of LEGACY_FACTS) {
    if (Object.hasOwn(state.facts ?? {}, legacyKey) && !typedFacts[typedKey]) {
      typedFacts[typedKey] = factRecord(state.facts[legacyKey], parser, citation, lastVerified);
    }
  }
  for (const [legacyKey, typedKey, parser] of LEGACY_GDL_FACTS) {
    if (Object.hasOwn(state.gdl ?? {}, legacyKey) && !typedFacts[typedKey]) {
      typedFacts[typedKey] = factRecord(state.gdl[legacyKey], parser, citation, lastVerified);
    }
  }
  return { ...state, typedFacts };
}

async function stateFiles(dir) {
  return (await readdir(dir))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(dir, name));
}

export async function runFactMigration({ statesDir = DEFAULT_STATES_DIR, write = false, stateCodes } = {}) {
  const results = [];
  for (const file of await stateFiles(statesDir)) {
    const state = JSON.parse(await readFile(file, 'utf8'));
    if (stateCodes && !stateCodes.has(state.code)) continue;
    const migrated = migrateStateFacts(state);
    const changed = JSON.stringify(migrated.typedFacts) !== JSON.stringify(state.typedFacts ?? {});
    if (write && changed) await writeFile(file, `${JSON.stringify(migrated, null, 2)}\n`);
    results.push({ code: state.code, changed, typedFactCount: Object.keys(migrated.typedFacts).length });
  }
  return results;
}

function parseArgs(argv) {
  const stateCodes = new Set();
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--state' && argv[index + 1]) stateCodes.add(argv[++index].toUpperCase());
  }
  return { write: argv.includes('--write'), stateCodes: stateCodes.size ? stateCodes : undefined };
}

export async function main(argv = process.argv.slice(2)) {
  const results = await runFactMigration(parseArgs(argv));
  for (const result of results) {
    console.log(`${result.code}: ${result.changed ? 'would migrate' : 'unchanged'} (${result.typedFactCount} typed facts)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
