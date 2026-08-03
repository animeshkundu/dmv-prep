import type { CardState, ChallengeBank } from './types';

export interface FlashcardCandidate {
  id: string;
}

function dueTime(card: CardState | undefined): number {
  return card ? new Date(card.due).getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Due cards always lead the session, followed by missed questions as priority-new
 * cards, then other new cards. New-card intake is capped separately from the session.
 */
export function buildFlashcardQueue<T extends FlashcardCandidate>(
  items: readonly T[],
  cards: Record<string, CardState>,
  challenge: ChallengeBank,
  now: Date,
  sessionSize = 20,
  newCardLimit = 10,
): T[] {
  const safeSessionSize = Math.max(1, Math.floor(sessionSize));
  const safeNewLimit = Math.max(0, Math.floor(newCardLimit));
  const nowMs = now.getTime();
  const due = items
    .filter((item) => cards[item.id] && dueTime(cards[item.id]) <= nowMs)
    .sort((left, right) => dueTime(cards[left.id]) - dueTime(cards[right.id]));
  const availableSlots = Math.max(0, safeSessionSize - due.length);
  if (!availableSlots) return due.slice(0, safeSessionSize);

  const activeMisses = new Map<string, ChallengeBank['items'][string]>(
    Object.values(challenge.items)
      .filter((item) => !item.retiredAt)
      .map((item) => [`${item.kind === 'question' ? 'q' : 's'}:${item.refId}`, item] as const),
  );
  const fresh = items.filter((item) => !cards[item.id]);
  const prioritized = fresh
    .filter((item) => activeMisses.has(item.id))
    .sort((left, right) => {
      const leftMiss = activeMisses.get(left.id)!;
      const rightMiss = activeMisses.get(right.id)!;
      return rightMiss.misses - leftMiss.misses || rightMiss.lastMissedAt.localeCompare(leftMiss.lastMissedAt);
    });
  const ordinary = fresh.filter((item) => !activeMisses.has(item.id));
  const newCards = [...prioritized, ...ordinary].slice(0, Math.min(safeNewLimit, availableSlots));
  return [...due, ...newCards];
}
