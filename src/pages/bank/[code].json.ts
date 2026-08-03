import type { APIRoute } from 'astro';
import { getBankBuildData } from '../../lib/bank-build';
import { STATES, stateSlug } from '../../lib/states-directory';

export const prerender = true;

export function getStaticPaths() {
  return STATES.map(({ code }) => ({ params: { code: stateSlug(code) } }));
}

export const GET: APIRoute = async ({ params }) => {
  const { banks, bankVersion } = await getBankBuildData();
  const code = params.code?.toLowerCase();

  if (!code || !(code in banks)) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(
    JSON.stringify({
      bankVersion,
      questions: banks[code],
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
};
