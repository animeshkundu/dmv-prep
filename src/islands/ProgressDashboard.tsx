import { useEffect, useRef, useState } from 'preact/hooks';
import type { Progress } from '../lib/types';
import { exportAll, getProgress, importAll } from '../lib/storage';
import { masteryByCategory, mockHistory, streakDays } from '../lib/progress';
import '../styles/study.css';

export default function ProgressDashboard({ statesHref }: { statesHref: string }) {
  const [progress, setProgress] = useState<Progress>({ attempts: {}, mockResults: [] });
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProgress().then((saved) => {
      setProgress(saved);
      setLoaded(true);
    });
  }, []);

  async function download() {
    const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'dmv-prep-backup.json';
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage('Backup downloaded.');
  }

  async function upload(file?: File) {
    if (!file) {
      setMessage('Choose a DMV Prep JSON backup to import.');
      return;
    }
    try {
      await importAll(await file.text());
      setProgress(await getProgress());
      setMessage('Import complete.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not import backup.');
    }
  }

  if (!loaded) return <section class="study-card card"><p class="muted">Loading progress from this device…</p></section>;

  const mastery = masteryByCategory(progress);
  const masteryValues = Object.values(mastery);
  const average = masteryValues.length
    ? masteryValues.reduce((total, value) => total + value, 0) / masteryValues.length
    : 0;
  const attempts = Object.values(progress.attempts).reduce(
    (total, attempt) => total + attempt.correct + attempt.incorrect,
    0,
  );
  const history = mockHistory(progress);

  if (!attempts && !history.length) {
    return (
      <section class="empty-progress card card-strong">
        <span class="empty-progress-mark" aria-hidden="true">0→1</span>
        <div>
          <p class="eyebrow">Your first step</p>
          <h2>Progress begins with one answer.</h2>
          <p>Choose your state and take a short practice set. Mastery, streaks, and mock history will appear here automatically.</p>
          <a class="btn btn-pop" href={statesHref}>Choose your state</a>
        </div>
      </section>
    );
  }

  return (
    <div class="progress-dashboard">
      <section class="metric-grid" aria-label="Progress summary">
        <article class="metric card"><strong>{attempts}</strong><span>practice answers</span></article>
        <article class="metric card"><strong>{Math.round(average * 100)}%</strong><span>topic average</span></article>
        <article class="metric card"><strong>{streakDays(progress)}</strong><span>day streak</span></article>
        <article class="metric card"><strong>{history.length}</strong><span>mock exams</span></article>
      </section>

      <section class="card study-card">
        <div>
          <p class="eyebrow">Topic mastery</p>
          <h2>Where you are strong, and what comes next.</h2>
        </div>
        <div class="mastery-list">
          {Object.entries(mastery)
            .sort(([, first], [, second]) => first - second)
            .map(([category, value]) => (
              <div class="mastery-row">
                <label>
                  <span>{category.replaceAll('-', ' ')}</span>
                  <span>{Math.round(value * 100)}%</span>
                </label>
                <progress class="study-progress" value={value} max={1}>
                  {Math.round(value * 100)}%
                </progress>
              </div>
            ))}
        </div>
      </section>

      <section class="card study-card">
        <div>
          <p class="eyebrow">Mock history</p>
          <h2>Test-day rehearsals</h2>
        </div>
        {history.length ? (
          <div class="history-list">
            {history.map((mock) => (
              <article>
                <span class={`history-status ${mock.passed ? 'pass' : 'fail'}`}>
                  {mock.passed ? 'Passed' : 'Keep practicing'}
                </span>
                <strong>{mock.correct}/{mock.total}</strong>
                <span>{mock.state} · {new Date(mock.completedAt).toLocaleDateString()}</span>
              </article>
            ))}
          </div>
        ) : (
          <p class="muted">No mock exams yet. Build confidence in practice, then rehearse the full format.</p>
        )}
      </section>

      <section class="card study-card">
        <div>
          <p class="eyebrow">Your data</p>
          <h2>Keep a private backup.</h2>
          <p class="muted">Download progress to a JSON file or restore a backup on this device.</p>
        </div>
        <div class="study-actions">
          <button class="btn btn-primary" onClick={() => void download()}>Export data</button>
          <button class="btn btn-ghost" onClick={() => input.current?.click()}>Import data</button>
          <input
            ref={input}
            class="visually-hidden"
            type="file"
            accept="application/json"
            aria-label="Choose progress backup"
            onChange={(changeEvent) => void upload(changeEvent.currentTarget.files?.[0])}
          />
        </div>
        <p aria-live="polite">{message}</p>
      </section>
    </div>
  );
}
