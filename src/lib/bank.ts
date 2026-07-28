import { createHash } from 'node:crypto';
import type { Question, Sign } from './types';
import { applicableQuestions } from './questions';
import { STATES } from './states-directory';

export interface ClientBankQuestion {
  id: string;
  category: Question['category'];
  tags: string[];
  prompt: string;
  imageAsset?: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Question['difficulty'];
  references: Array<{ citation: string }>;
}

export interface ClientSign {
  id: string;
  name: string;
  category: Sign['category'];
  asset: string;
  altText?: string;
  meaning: string;
}

export type BankByCode = Record<string, ClientBankQuestion[]>;

/** Removes authoring and provenance fields before question content reaches a client. */
export function toClientBank(questions: Question[], stateCode: string): ClientBankQuestion[] {
  return applicableQuestions(questions, stateCode)
    .map((question) => ({
      id: question.id,
      category: question.category,
      tags: question.tags,
      prompt: question.prompt,
      ...(question.imageAsset ? { imageAsset: question.imageAsset } : {}),
      options: question.options,
      correctIndex: question.correctIndex,
      explanation: question.explanation,
      difficulty: question.difficulty,
      references: [{ citation: question.references[0].citation }],
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function allClientBanks(questions: Question[]): BankByCode {
  return Object.fromEntries(
    STATES.map(({ code }) => [code.toLowerCase(), toClientBank(questions, code)]),
  );
}

/**
 * A stable fingerprint of all serialized bank payloads. The version field itself
 * is deliberately excluded, so the bytes being fingerprinted are not circular.
 */
export function aggregateBankVersion(banks: BankByCode): string {
  const bytes = STATES
    .map(({ code }) => JSON.stringify(banks[code.toLowerCase()]))
    .join('\n');
  return createHash('sha256').update(bytes).digest('hex');
}

/** Removes sign provenance and other build-only metadata from the client payload. */
export function toClientSigns(signs: Sign[]): ClientSign[] {
  return signs
    .map((sign) => ({
      id: sign.id,
      name: sign.name,
      category: sign.category,
      asset: sign.asset,
      ...('altText' in sign && typeof sign.altText === 'string'
        ? { altText: sign.altText }
        : {}),
      meaning: sign.meaning,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}
