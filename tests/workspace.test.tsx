import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { SprintWorkspace } from '../components/pm/SprintWorkspace';
import { CurrentUserProvider } from '../lib/auth/CurrentUserContext';
import { taskSchema } from '../lib/server/domain';

test('unconfigured translation stays silent across polling and only explains setup on explicit language changes', async () => {
 const {window, document} = parseHTML('<html><head></head><body><div id="root"></div></body></html>');
 const names = ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'Element', 'Node', 'Event', 'localStorage', 'location', 'matchMedia', 'setInterval', 'clearInterval', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'];
 const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
 let poll: (() => void) | undefined;
 let translations = 0;
 let loads = 0;
 const preferences = new Map([['pm.lang', 'ko']]);
 Object.assign(globalThis, {
  window, document, HTMLElement: window.HTMLElement, HTMLIFrameElement: window.HTMLIFrameElement,
  Element: window.Element, Node: window.Node, Event: window.Event,
  localStorage: {getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value)},
  location: {search: '', pathname: '/', origin: 'http://127.0.0.1:4314'},
  matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}}),
  setInterval: (callback: () => void) => {poll = callback; return 1;},
  clearInterval() {},
  IS_REACT_ACT_ENVIRONMENT: true,
  fetch: async (url: string) => {
   if (url === '/api/pm/workspace') {
    loads++;
    return Response.json({projects: [], comments: [], sprints: [], tasks: [{...taskSchema.parse({title: 'Example task'}), id: 'ui-fixture', createdAt: '', updatedAt: ''}]});
   }
   if (url === '/api/pm/i18n') return Response.json([]);
   if (url === '/api/pm/translate') {
    translations++;
    return Response.json({error: 'Configure OPENAI_API_KEY'}, {status: 503});
   }
   throw new Error(`Unexpected request: ${url}`);
  },
 });
 const root = createRoot(document.getElementById('root')!);
 try {
  await act(async () => root.render(
   <CurrentUserProvider user={{id: 'ui-owner', fullName: 'Fixture User', email: 'fixture@example.test', role: 'admin', team: 'engineer', title: '', avatarUrl: null}}>
    <SprintWorkspace translation={{ready: false, required: ['INTEGRATION_OWNER_ID', 'OPENAI_API_KEY', 'OPENAI_MODEL']}}/>
   </CurrentUserProvider>,
  ));
  assert.equal(translations, 0);
  assert.equal(document.querySelector('[role="status"]'), null);
  assert.ok(poll);
  await act(async () => {poll!();});
  await act(async () => {poll!();});
  assert.equal(loads, 3);
  assert.equal(translations, 0);
  const toggle = document.querySelector<HTMLButtonElement>('[aria-label="Toggle display language"]')!;
  await act(async () => toggle.click());
  assert.match(document.querySelector('[role="status"]')?.textContent ?? '', /OPENAI_API_KEY/);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click());
  await act(async () => {poll!();});
  assert.equal(document.querySelector('[role="status"]'), null);
  assert.equal(translations, 0);
 } finally {
  await act(async () => root.unmount());
  for (const [name, descriptor] of previous) {
   if (descriptor) Object.defineProperty(globalThis, name, descriptor);
   else Reflect.deleteProperty(globalThis, name);
  }
 }
});
