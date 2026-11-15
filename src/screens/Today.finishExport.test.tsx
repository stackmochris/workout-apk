// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../lib/auth';
import { syncSession } from '../lib/cloudSync';
import { exportWorkoutSheet } from '../lib/exportWorkoutSheet';
import { freshData, type AppData } from '../lib/store';
import type { BodyEntry } from '../types';
import Today from './Today';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../lib/firebase', () => ({
  auth: null,
  db: null,
  firebaseApp: null,
  firebaseConfig: {},
}));

vi.mock('../lib/cloudSync', () => ({
  syncSession: vi.fn(),
  syncBody: vi.fn(),
}));

vi.mock('../lib/exportWorkoutSheet', () => ({
  exportWorkoutSheet: vi.fn(),
}));

const SUCCESS = {
  ok: true as const,
  message: 'Created Workout Export in your Google Drive and wrote your sessions and body stats.',
  spreadsheetId: 'createdsheetid00000001',
  url: 'https://docs.google.com/spreadsheets/d/createdsheetid00000001',
  created: true,
  synced: true,
};

function weighIn(): BodyEntry {
  const now = new Date().toISOString();
  return { id: 'weigh-in', date: now, weight: 80, author: 'app', updatedAt: now };
}

function Harness() {
  const [data, setData] = useState<AppData>(() => ({ ...freshData(), body: [weighIn()] }));
  return (
    <>
      <output data-count={data.sessions.length} />
      <Today data={data} setData={setData} />
    </>
  );
}

function sessionCount() {
  return Number(document.querySelector('output')?.dataset.count ?? '0');
}

function exportDialog() {
  return document.getElementById('finish-export-title')?.closest('[role="dialog"]') ?? null;
}

function findButton(match: (label: string) => boolean, root: ParentNode = document) {
  const buttons = [...root.querySelectorAll('button')].filter((button) => match(button.textContent?.trim() ?? ''));
  if (!buttons.length) {
    const labels = [...document.querySelectorAll('button')].map((button) => button.textContent?.trim()).join(' | ');
    throw new Error(`Button not found. Have: ${labels}`);
  }
  return buttons[buttons.length - 1] as HTMLButtonElement;
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openFinish() {
  await click(findButton((label) => label === 'Start workout'));
  const log = document.querySelector<HTMLButtonElement>('[aria-label="Log set 1"]');
  if (!log) throw new Error('Log set 1 missing');
  await click(log);
  await click(findButton((label) => label === 'Finish workout'));
}

async function finishWorkout() {
  await openFinish();
  expect(exportDialog()).toBeNull();
  await click(findButton((label) => label === 'Save workout'));
  expect(exportDialog()).toBeNull();
  expect(document.body.textContent).toContain('Workout saved');
  await click(findButton((label) => label === 'Export'));
}

describe('finish workout sheet prompt', () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.mocked(exportWorkoutSheet).mockReset();
    vi.mocked(exportWorkoutSheet).mockResolvedValue(SUCCESS);
    vi.mocked(syncSession).mockClear();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => {}) },
    });
  });

  afterEach(async () => {
    if (root) {
      const current = root;
      root = null;
      await act(async () => { current.unmount(); });
    }
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  async function renderToday() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <AuthProvider>
          <Harness />
        </AuthProvider>,
      );
    });
  }

  it('focuses the next set input after logging', async () => {
    await renderToday();
    await click(findButton((label) => label === 'Start workout'));
    await click(document.querySelector<HTMLButtonElement>('[aria-label="Log set 1"]')!);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Set 2 kg');
  });

  it('offers optional export after the workout is saved', async () => {
    await renderToday();
    expect(exportDialog()).toBeNull();
    await finishWorkout();
    expect(sessionCount()).toBe(1);
    expect(exportDialog()?.textContent).toContain('Export to Google Sheet?');
    expect(exportDialog()?.textContent).toContain('This workout is saved');
    expect(exportWorkoutSheet).not.toHaveBeenCalled();
    expect(syncSession).toHaveBeenCalledTimes(1);
  });

  it('does not export when the finish sheet is cancelled', async () => {
    await renderToday();
    await openFinish();
    await click(findButton((label) => label === 'Keep logging'));
    expect(sessionCount()).toBe(0);
    expect(exportDialog()).toBeNull();
    expect(exportWorkoutSheet).not.toHaveBeenCalled();
  });

  it('can dismiss export and choose it on a later receipt', async () => {
    await renderToday();
    await finishWorkout();
    const dialog = exportDialog();
    if (!dialog) throw new Error('export prompt missing');
    await click(findButton((label) => label === 'Not now', dialog));
    expect(exportDialog()).toBeNull();
    expect(exportWorkoutSheet).not.toHaveBeenCalled();
    expect(sessionCount()).toBe(1);
    await click(findButton((label) => label === 'Done'));

    await finishWorkout();
    expect(sessionCount()).toBe(2);
    expect(exportDialog()?.textContent).toContain('Export to Google Sheet?');
    expect(exportWorkoutSheet).not.toHaveBeenCalled();
  });

  it('does not ask when the session is skipped', async () => {
    await renderToday();
    await click(findButton((label) => label.startsWith('Skip ')));
    expect(sessionCount()).toBe(1);
    expect(exportDialog()).toBeNull();
    expect(exportWorkoutSheet).not.toHaveBeenCalled();
  });

  it('preserves a logged set when swapping the remaining work', async () => {
    await renderToday();
    await click(findButton((label) => label === 'Start workout'));
    const log = document.querySelector<HTMLButtonElement>('[aria-label="Log set 1"]')!;
    await click(log);
    await click(findButton((label) => label === 'Swap exercise'));
    const choice = document.querySelector<HTMLButtonElement>('.pick button');
    if (!choice) throw new Error('No replacement exercises');
    await click(choice);
    await click(findButton((label) => label === 'Finish workout'));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('1 logged sets');
    await click(findButton((label) => label === 'Save workout'));
    const [session] = vi.mocked(syncSession).mock.calls[0];
    expect(session.movements).toHaveLength(1);
    expect(session.movements[0].sets).toHaveLength(1);
    expect(session.movements[0].sets[0].done).toBe(true);
  });

  it('exports the finished workout when they accept', async () => {
    await renderToday();
    await finishWorkout();
    const dialog = exportDialog();
    if (!dialog) throw new Error('export prompt missing');
    const exportButton = findButton((label) => label === 'Export', dialog);
    expect(exportButton.disabled).toBe(false);
    await click(exportButton);

    expect(exportWorkoutSheet).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(exportWorkoutSheet).mock.calls[0][0];
    expect(arg.user).toBeNull();
    expect(arg.pasted).toBeUndefined();
    expect(arg.sessions).toHaveLength(1);
    expect(arg.sessions[0]?.status).toBe('completed');
    expect(arg.body).toHaveLength(1);
    expect(exportDialog()?.textContent).toContain(SUCCESS.message);
    const link = exportDialog()?.querySelector('a.sheet-link');
    expect(link?.textContent).toBe('Open in Google Sheets');
    expect(link?.getAttribute('href')).toBe(SUCCESS.url);
    expect(sessionCount()).toBe(1);
  });

  it('leaves a still-running export without undoing the workout', async () => {
    let resolveExport: (value: typeof SUCCESS) => void = () => {};
    vi.mocked(exportWorkoutSheet).mockImplementation(() => new Promise((resolve) => { resolveExport = resolve; }));
    await renderToday();
    await finishWorkout();
    const dialog = exportDialog();
    if (!dialog) throw new Error('export prompt missing');
    await click(findButton((label) => label === 'Export', dialog));
    const working = exportDialog();
    expect(working?.textContent).toContain('Exporting to Google Sheet');
    await click(findButton((label) => label === 'Not now', working!));
    expect(exportDialog()).toBeNull();
    expect(sessionCount()).toBe(1);
    resolveExport(SUCCESS);
    await act(async () => { await Promise.resolve(); });
    expect(exportDialog()).toBeNull();
    expect(sessionCount()).toBe(1);
    expect(exportWorkoutSheet).toHaveBeenCalledTimes(1);
  });

  it('keeps the finished workout when export fails', async () => {
    vi.mocked(exportWorkoutSheet).mockResolvedValue({
      ok: false,
      message: 'You are offline. The Google Sheet was not updated.',
    });
    await renderToday();
    await finishWorkout();
    const dialog = exportDialog();
    if (!dialog) throw new Error('export prompt missing');
    await click(findButton((label) => label === 'Export', dialog));

    expect(sessionCount()).toBe(1);
    expect(syncSession).toHaveBeenCalledTimes(1);
    const shown = exportDialog();
    expect(shown?.textContent).toContain('Google Sheet was not updated');
    expect(shown?.textContent).toContain('You are offline. The Google Sheet was not updated.');
    expect(shown?.querySelector('a.sheet-link')).toBeNull();

    await click(findButton((label) => label === 'Done', shown!));
    expect(exportDialog()).toBeNull();
    expect(sessionCount()).toBe(1);
  });

  it('keeps the finished workout when export throws', async () => {
    vi.mocked(exportWorkoutSheet).mockRejectedValue(Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' }));
    await renderToday();
    await finishWorkout();
    const dialog = exportDialog();
    if (!dialog) throw new Error('export prompt missing');
    await click(findButton((label) => label === 'Export', dialog));

    expect(sessionCount()).toBe(1);
    expect(exportDialog()?.textContent).toContain('Google sign-in was cancelled. The sheet was not updated.');
    expect(exportDialog()?.querySelector('a.sheet-link')).toBeNull();
  });
});
