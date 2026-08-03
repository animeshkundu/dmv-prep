import { createStore, del, get, keys, set } from 'idb-keyval';
import type { ClientQuestion } from './questions';

const bankStore = createStore('dmvp', 'banks');
const keyFor = (stateCode: string, version: string) =>
  `bank:${stateCode.toLowerCase()}:${version}`;

export async function getCachedBank(
  stateCode: string,
  version: string,
): Promise<ClientQuestion[] | undefined> {
  return get<ClientQuestion[]>(keyFor(stateCode, version), bankStore);
}

export async function putCachedBank(
  stateCode: string,
  version: string,
  questions: ClientQuestion[],
): Promise<void> {
  const prefix = `bank:${stateCode.toLowerCase()}:`;
  const currentKey = keyFor(stateCode, version);
  await set(currentKey, questions, bankStore);
  const stale = (await keys(bankStore))
    .filter((key): key is string => typeof key === 'string')
    .filter((key) => key.startsWith(prefix) && key !== currentKey);
  await Promise.all(stale.map((key) => del(key, bankStore)));
}
