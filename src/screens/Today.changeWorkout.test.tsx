// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextCutSession } from '../engine/cut';
import { AuthProvider } from '../lib/auth';
import { freshData, type AppData } from '../lib/store';
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

function Harness() {
  const [data, setData] = useState<AppData>(freshData);
  const last = data.sessions.at(-1);
  const set = last?.movements[0]?.sets[0];
  return (
    <>
      <output
        data-programme={data.settings.programme}
        data-goal={data.settings.goal}
        data-anchor={data.settings.cutAnchor}
        data-days={JSON.stringify(data.settings.cutDays)}
        data-rotation={JSON.stringify(data.rotation)}
        data-count={data.sessions.length}
        data-focus={last?.focus ?? ''}
        data-letter={last ? (last.letter ?? 'none') : ''}
        data-elbow={last?.elbowPain ?? ''}
        data-rir={set?.rir ?? ''}
      />
      <Today data={data} setData={setData} />
    </>
  );
}

function read() {
  const node = document.querySelector('output');
  if (!node) throw new Error('Harness missing');
  return {
    programme: node.dataset.programme,
    goal: node.dataset.goal,
    anchor: node.dataset.anchor,
    days: node.dataset.days,
    rotation: node.dataset.rotation,
    count: Number(node.dataset.count ?? '0'),
    focus: node.dataset.focus,
    letter: node.dataset.letter,
    elbow: node.dataset.elbow,
    rir: node.dataset.rir,
  };
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

async function setInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('change workout', () => {
  let root: Root | null = null;
  const plannedLetter = nextCutSession(new Date(), freshData().settings.cutDays).letter;

  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
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

  async function openChange() {
    const button = document.querySelector<HTMLButtonElement>('[aria-label="Change workout"]');
    if (!button) throw new Error('Change workout missing');
    await click(button);
  }

  it('switches today to Freestyle in cut mode without moving the plan, then saves no letter', async () => {
    await renderToday();
    const before = read();
    expect(before.programme).toBe('cut');
    expect(document.querySelector('h1')?.textContent).toContain(plannedLetter);
    expect(document.querySelector('.goal-badge')?.textContent).toBe('Mixed');

    await openChange();
    await click(findButton((label) => label === 'Freestyle today'));
    expect(vi.mocked(confirm)).not.toHaveBeenCalled();
    expect(document.querySelector('h1')?.textContent).toContain('Freestyle');
    expect(document.querySelector('h1')?.textContent?.trim().startsWith(plannedLetter)).toBe(false);
    expect(read()).toMatchObject({
      programme: before.programme,
      anchor: before.anchor,
      days: before.days,
      rotation: before.rotation,
      count: 0,
    });

    await click(findButton((label) => label === 'Start workout'));
    await click(findButton((label) => label === '+ Add movement'));
    const choice = document.querySelector<HTMLButtonElement>('.pick button');
    if (!choice) throw new Error('Add-movement picker is empty');
    await click(choice);
    const rir = document.querySelector<HTMLInputElement>('[aria-label="Set 1 RIR"]');
    if (!rir) throw new Error('RIR input missing');
    await setInput(rir, '2');
    await click(document.querySelector<HTMLButtonElement>('[aria-label="Log set 1"]')!);
    await click(findButton((label) => label === 'Finish workout'));
    const elbow = [...document.querySelectorAll('.elbow-scale button')].find((button) => button.textContent === '3');
    if (!elbow) throw new Error('Elbow check missing');
    await click(elbow as HTMLButtonElement);
    await click(findButton((label) => label === 'Save workout'));

    const after = read();
    expect(after.count).toBe(1);
    expect(after.focus).toBe('Freestyle');
    expect(after.letter).toBe('none');
    expect(after.elbow).toBe('3');
    expect(after.rir).toBe('2');
    expect(after.programme).toBe(before.programme);
    expect(after.anchor).toBe(before.anchor);
    expect(after.days).toBe(before.days);
    expect(after.rotation).toBe(before.rotation);
    expect(after.goal).toBe(before.goal);
  });

  it('returns to the planned cut letter', async () => {
    await renderToday();
    const before = read();
    await openChange();
    await click(findButton((label) => label === 'Freestyle today'));
    expect(document.querySelector('h1')?.textContent).toContain('Freestyle');
    await click(findButton((label) => label === 'Back to planned session'));
    expect(document.querySelector('h1')?.textContent?.trim().startsWith(plannedLetter)).toBe(true);
    expect(document.querySelector('h1')?.textContent).not.toContain('Freestyle');
    expect(read()).toMatchObject({
      programme: before.programme,
      anchor: before.anchor,
      days: before.days,
      rotation: before.rotation,
      count: 0,
    });
  });

  it('updates the training goal from the sheet', async () => {
    await renderToday();
    await openChange();
    await click(findButton((label) => label === 'Hypertrophy'));
    expect(read().goal).toBe('hypertrophy');
    expect(read().programme).toBe('cut');
    expect(document.querySelector('.goal-badge')?.textContent).toBe('Hypertrophy');
  });
});
