import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { toClientSigns } from '../../lib/bank';
import { getBankBuildData } from '../../lib/bank-build';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [signEntries, { bankVersion }] = await Promise.all([
    getCollection('signs'),
    getBankBuildData(),
  ]);

  return new Response(
    JSON.stringify({
      bankVersion,
      signs: toClientSigns(signEntries.map((entry) => entry.data)),
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
};
