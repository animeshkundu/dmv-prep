import { getCollection } from 'astro:content';
import type { StateContent } from './types';

export async function studyContent(code: string) {
  const [questionEntries, stateEntries, signEntries] = await Promise.all([
    getCollection('questions'), getCollection('states'), getCollection('signs'),
  ]);
  return {
    questions: questionEntries.map((entry) => entry.data),
    state: stateEntries.find((entry) => entry.data.code === code.toUpperCase())?.data as StateContent | undefined,
    signs: signEntries.map((entry) => entry.data),
  };
}
