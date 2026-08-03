import { getCollection } from 'astro:content';
import { aggregateBankVersion, allClientBanks } from './bank';

let buildData: Promise<{
  banks: ReturnType<typeof allClientBanks>;
  bankVersion: string;
}> | undefined;

/** Compute the emitted banks once per build, then share the same version with routes and pages. */
export function getBankBuildData() {
  buildData ??= getCollection('questions').then((entries) => {
    const banks = allClientBanks(entries.map((entry) => entry.data));
    return { banks, bankVersion: aggregateBankVersion(banks) };
  });
  return buildData;
}
