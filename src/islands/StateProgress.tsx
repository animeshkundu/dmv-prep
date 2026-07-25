import { useEffect, useState } from 'preact/hooks';
import type { Progress } from '../lib/types';
import { masteryByCategory, mockHistory, streakDays } from '../lib/progress';
import { getProgress } from '../lib/storage';
import '../styles/study.css';

interface Props {
  stateName: string;
  stateCode: string;
  practiceHref: string;
  mockHref: string;
  progressHref: string;
}

export default function StateProgress({ stateName, stateCode, practiceHref, mockHref, progressHref }: Props) {
  const [progress, setProgress] = useState<Progress>();

  useEffect(() => {
    getProgress().then(setProgress);
  }, []);

  if (!progress) {
    return <section class="card study-card" aria-label="Study plan"><p class="muted">Loading your study plan…</p></section>;
  }

  const mastery = Object.values(masteryByCategory(progress));
  const average = mastery.length
    ? mastery.reduce((total, value) => total + value, 0) / mastery.length
    : 0;
  const latestMock = mockHistory(progress).find((result) => result.state === stateCode);
  const hasPractice = Object.keys(progress.attempts).length > 0;
  const action = !hasPractice
    ? { eyebrow: 'Your next best step', title: 'Take a 10-question warm-up', copy: `Start with a short ${stateName} practice set. You will get an explanation and source after every answer.`, href: practiceHref, label: 'Start practice' }
    : !latestMock
      ? { eyebrow: 'Bring your progress to this state', title: `Take a ${stateName} warm-up`, copy: 'Your overall study history follows you. Start here with a short set before rehearsing this state’s test format.', href: practiceHref, label: 'Start state practice' }
      : !latestMock.passed
        ? { eyebrow: 'Close the gaps', title: 'Review, then retake the mock', copy: `Your latest ${stateName} mock was ${latestMock.correct} of ${latestMock.total}. Use a focused set before your next rehearsal.`, href: practiceHref, label: 'Review with practice' }
        : { eyebrow: 'Keep your test-day rhythm', title: 'Rehearse the full test again', copy: `You passed your latest ${stateName} mock. Take a fresh version to make that result consistent.`, href: mockHref, label: 'Take another mock' };

  return (
    <section class="progress-plan card card-strong" aria-label="Study plan">
      <div>
        <p class="plan-eyebrow">{action.eyebrow}</p>
        <h2>{action.title}</h2>
        <p>{action.copy}</p>
        <a class="btn btn-pop" href={action.href}>{action.label} <span aria-hidden="true">→</span></a>
      </div>
      <div class="plan-stats">
        <div><strong>{streakDays(progress)}</strong><span>overall day streak</span></div>
        <div><strong>{Math.round(average * 100)}%</strong><span>overall topic average</span></div>
        <div><strong>{latestMock ? `${latestMock.correct}/${latestMock.total}` : 'Not yet'}</strong><span>latest {stateName} mock</span></div>
        <a href={progressHref}>View all progress</a>
      </div>
    </section>
  );
}
