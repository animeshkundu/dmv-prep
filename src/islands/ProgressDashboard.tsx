import { useEffect, useRef, useState } from 'preact/hooks';
import type { Progress } from '../lib/types';
import { exportAll, getProgress, importAll } from '../lib/storage';
import { masteryByCategory, mockHistory, streakDays } from '../lib/progress';
import '../styles/study.css';

export default function ProgressDashboard() {
  const [progress, setProgress] = useState<Progress>({ attempts: {}, mockResults: [] });
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { getProgress().then(setProgress); }, []);
  async function download() { const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'dmv-prep-backup.json'; link.click(); URL.revokeObjectURL(link.href); }
  async function upload(file?: File) { if (!file) return; try { await importAll(await file.text()); setProgress(await getProgress()); setMessage('Import complete.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not import backup.'); } }
  const mastery = masteryByCategory(progress);
  return <section class="study-card card"><h2>Your progress</h2><p><strong>{streakDays(progress)}</strong> day streak</p><div>{Object.entries(mastery).map(([category, value]) => <div><label>{category.replaceAll('-', ' ')} <span>{Math.round(value * 100)}%</span></label><progress class="study-progress" value={value} max={1}/></div>)}</div>{Object.keys(mastery).length === 0 && <p class="muted">Complete a practice question to see mastery here.</p>}<h3>Mock history</h3>{mockHistory(progress).map((mock) => <p>{new Date(mock.completedAt).toLocaleDateString()}: {mock.correct}/{mock.total} · {mock.passed ? 'Passed' : 'Not passed'}</p>)}<div class="study-actions"><button class="btn btn-primary" onClick={download}>Export data</button><button class="btn btn-ghost" onClick={() => input.current?.click()}>Import data</button><input ref={input} class="visually-hidden" type="file" accept="application/json" onChange={(event) => upload(event.currentTarget.files?.[0])}/></div><p aria-live="polite">{message}</p></section>;
}
