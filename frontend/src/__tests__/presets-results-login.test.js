import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
global.IS_REACT_ACT_ENVIRONMENT = true;
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import AdvancedTools from '../pages/AdvancedTools';
import Login from '../pages/Login';
import AIResultView from '../components/AIResultView';
import AIOutput from '../components/AIOutput';
import ContentRecordDialog from '../components/ContentRecordDialog';
import CreateModal from '../components/CreateModal';
import GovernedWorkflow from '../pages/GovernedWorkflow';
import FeaturePage from '../pages/FeaturePage';

jest.mock('axios', () => { const api = jest.fn(); api.get = jest.fn(); api.post = jest.fn(); return { __esModule: true, default: api }; });
jest.mock('../components/Navbar', () => () => null);
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));

let root, host;
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  axios.get.mockResolvedValue({ data: { upcoming: [] } });
  axios.post.mockResolvedValue({ data: { token: 'fixture-token' } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.clearAllMocks(); });
const render = async (node) => act(async () => { root.render(<MemoryRouter>{node}</MemoryRouter>); });
const click = async (node) => act(async () => { node.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

test('advanced presets fill optional and required inputs without invoking AI', async () => {
  await render(<AdvancedTools />);
  await click([...host.querySelectorAll('.feature-card')].find(node => node.querySelector('h3')?.textContent === 'Performance Predictor'));
  expect(host.querySelectorAll('.sr-presets button')).toHaveLength(3);
  await click(host.querySelector('.sr-presets button'));
  const panel = host.querySelector('.sr-presets').parentElement;
  const values = [...panel.querySelectorAll('textarea, input, select')].map(node => node.value);
  expect(values).toHaveLength(4);
  expect(values.every(Boolean)).toBe(true);
  expect(values[2]).toMatch(/Team leads/);
  expect(values[3]).toMatch(/No historical/);
  expect(axios.post).not.toHaveBeenCalled();
});

test('content creation presets fill optional category without saving or generating', async () => {
  await render(<CreateModal featureName="content_library" onClose={() => {}} onCreated={() => {}} />);
  expect(host.querySelectorAll('.sr-presets button')).toHaveLength(3);
  await click(host.querySelectorAll('.sr-presets button')[0]);
  const values = [...host.querySelectorAll('.modal-body input, .modal-body textarea')].map(node => node.value);
  expect(values).toHaveLength(3);
  expect(values.every(Boolean)).toBe(true);
  expect(axios.post).not.toHaveBeenCalled();
});

test('every advanced AI panel has three fill-only examples for every editable input', async () => {
  await render(<AdvancedTools />);
  const cards = [...host.querySelectorAll('.feature-card')].filter(node => node.querySelector('h3')?.textContent !== 'Cross-Platform Content Calendar');
  for (const card of cards) {
    await click(card);
    const presets = host.querySelectorAll('.sr-presets button');
    expect(presets).toHaveLength(3);
    for (const button of presets) {
      await click(button);
      const inputs = [...host.querySelector('.sr-presets').parentElement.querySelectorAll('textarea, input, select')];
      expect(inputs.length).toBeGreaterThan(0);
      expect(inputs.every(node => node.value !== '')).toBe(true);
      expect(axios.post).not.toHaveBeenCalled();
    }
  }
});

test('governed presets use a real selected source and do not generate or upload', async () => {
  const sourceText = 'A source-backed meeting guide starts with an agenda and names owners for each follow-up.';
  axios.get.mockImplementation((url) => url === '/api/auth/me' ? Promise.resolve({ data: { user: { id: 1, role: 'editor', tenant_id: 'fixture' } } }) : Promise.resolve({ data: {} }));
  axios.mockImplementation(({ url }) => {
    if (url.endsWith('/workflows')) return Promise.resolve({ data: { items: [{ id: 11, source_uri: 'https://example.test/source', state: 'ingested', updated_at: '2026-01-01' }] } });
    if (url.endsWith('/delivery-status')) return Promise.resolve({ data: { wordpressConfigured: false } });
    if (url.endsWith('/workflows/11')) return Promise.resolve({ data: { workflow: { id: 11, source_uri: 'https://example.test/source', rights_basis: 'owned', state: 'ingested' }, source: { filename: 'source.txt', media_type: 'text/plain', byte_length: sourceText.length, source_sha256: 'fixture-hash', source_text: sourceText }, variants: [], outbox: [], performance: [] } });
    throw new Error(`Unexpected fixture request: ${url}`);
  });
  await render(<GovernedWorkflow />);
  await click([...host.querySelectorAll('button')].find(node => node.textContent.includes('https://example.test/source')));
  const source = [...host.querySelectorAll('textarea')].find(node => node.value === sourceText);
  source.setSelectionRange(0, sourceText.length);
  await click([...host.querySelectorAll('button')].find(node => node.textContent.includes('Use selection for AI suggestion')));
  expect(host.querySelectorAll('.sr-presets button')).toHaveLength(3);
  await click(host.querySelectorAll('.sr-presets button')[1]);
  expect([...host.querySelectorAll('select')].find(node => node.value === 'email')).toBeTruthy();
  expect([...host.querySelectorAll('textarea')].some(node => node.value === sourceText)).toBe(true);
  expect([...host.querySelectorAll('textarea')].some(node => node.value === 'https://example.test/source')).toBe(true);
  expect(axios.post).not.toHaveBeenCalled();
  expect(axios.mock.calls.every(([config]) => config.method === 'get')).toBe(true);
});

test('saved content detail uses structured report view', async () => {
  axios.get.mockResolvedValueOnce({ data: { item: { id: 7, title: 'Saved fixture', content: 'Source fixture', ai_output: JSON.stringify({ score: 0, approved: false, note: '', facts: [{ claim: 'Example' }] }) } } });
  await render(<ContentRecordDialog featureName="blog_to_social" itemId={7} onClose={() => {}} />);
  expect(host.querySelector('.sr-report-table')).not.toBeNull();
  expect(host.textContent).toMatch(/Approved/);
  expect(host.textContent).toMatch(/Empty string/);
  expect(host.textContent).toMatch(/No/);
  expect(host.textContent).toMatch(/0/);
});

test('saved history row opens readable structured detail', async () => {
  axios.get.mockImplementation((url) => url === '/api/content/blog_to_social'
    ? Promise.resolve({ data: [{ id: 7, title: 'Saved fixture', status: 'completed', created_at: '2026-01-01' }] })
    : Promise.resolve({ data: { item: { id: 7, title: 'Saved fixture', content: 'Source fixture', ai_output: JSON.stringify({ findings: [{ point: 'Example', score: 0, verified: false }], note: '' }) } } }));
  await act(async () => { root.render(<MemoryRouter initialEntries={['/feature/blog_to_social']}><Routes><Route path="/feature/:featureName" element={<FeaturePage />} /></Routes></MemoryRouter>); });
  await click([...host.querySelectorAll('button')].find(node => node.textContent === 'View'));
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(host.querySelector('.sr-report-table')).not.toBeNull();
  expect(host.textContent).toMatch(/Empty string/);
  expect(host.textContent).toMatch(/No/);
  expect(host.textContent).toMatch(/0/);
});

test('returned and saved JSON show labels, tables, false, zero and empty strings', async () => {
  const payload = { id: 0, findings: [{ claim: 'Illustrative', score: 0, verified: false }], summary: '', facts: { count: 0, approved: false } };
  await render(<><AIOutput content={payload} /><AIResultView result={JSON.stringify(payload)} title="Saved report" /></>);
  expect(host.querySelectorAll('table')).toHaveLength(2);
  expect(host.textContent).toMatch(/Findings/);
  expect(host.textContent).toMatch(/Facts/);
  expect(host.textContent).toMatch(/Id/);
  expect(host.textContent).toMatch(/Empty string/);
  expect(host.textContent).toMatch(/No/);
  expect(host.textContent).toMatch(/0/);
  expect(host.textContent).not.toMatch(/\{"findings"/);
});

test('demo fill only sets configured credentials and never submits', async () => {
  const oldEmail = process.env.REACT_APP_DEMO_EMAIL, oldPassword = process.env.REACT_APP_DEMO_PASSWORD;
  process.env.REACT_APP_DEMO_EMAIL = 'demo-fixture@example.test';
  process.env.REACT_APP_DEMO_PASSWORD = 'fixture-only-password';
  try {
    await render(<Login />);
    await click([...host.querySelectorAll('button')].find(node => node.textContent.includes('Auto Fill')));
    const fields = host.querySelectorAll('input');
    expect(fields[0].value).toBe('demo-fixture@example.test');
    expect(fields[1].value).toBe('fixture-only-password');
    expect(axios.post).not.toHaveBeenCalled();
  } finally {
    if (oldEmail === undefined) delete process.env.REACT_APP_DEMO_EMAIL; else process.env.REACT_APP_DEMO_EMAIL = oldEmail;
    if (oldPassword === undefined) delete process.env.REACT_APP_DEMO_PASSWORD; else process.env.REACT_APP_DEMO_PASSWORD = oldPassword;
  }
});
