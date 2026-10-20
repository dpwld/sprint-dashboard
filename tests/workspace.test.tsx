import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { SprintWorkspace } from '../components/pm/SprintWorkspace';
import { MobileTaskList } from '../components/pm/MobileTaskList';
import { TaskList } from '../components/pm/TaskList';
import { TaskBoard } from '../components/pm/TaskBoard';
import { CalendarView } from '../components/pm/CalendarView';
import { RoadmapView } from '../components/pm/RoadmapView';
import { DiagramView } from '../components/pm/DiagramView';
import { TaskDrawer } from '../components/pm/TaskDrawer';
import { CurrentUserProvider } from '../lib/auth/CurrentUserContext';
import { taskSchema } from '../lib/server/domain';
import { pmToday } from '../lib/data/pm';
import { PRIORITY_COLOR, PRIORITY_DOT } from '../components/pm/pmFormat';

test('English workspace ignores legacy Korean display preference and preserves authored text across polling', async () => {
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
    return Response.json({projects: [], comments: [], sprints: [], tasks: [{...taskSchema.parse({title: '사용자가 작성한 작업'}), id: 'ui-fixture', createdAt: '', updatedAt: ''}]});
   }
   if (url === '/api/pm/i18n') {translations++; return Response.json([]);}
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
    <SprintWorkspace/>
   </CurrentUserProvider>,
  ));
  assert.equal(translations, 0);
  assert.equal(document.querySelector('[role="status"]'), null);
  assert.ok(poll);
  await act(async () => {poll!();});
  await act(async () => {poll!();});
  assert.equal(loads, 3);
  assert.equal(translations, 0);
  assert.equal(document.querySelector('[aria-label="Toggle display language"]'), null);
  assert.equal(document.querySelector('#sprint-language'), null);
  assert.match(document.body.textContent ?? '', /사용자가 작성한 작업/);
  const tabs = [...document.querySelectorAll('[role="tab"]')].map(tab => tab.textContent);
  assert.deepEqual(tabs, ['Engineering', 'Manufacturing', 'Business', 'List', 'Diagram', 'Board', 'Roadmap', 'Calendar', 'Due', 'People', 'Projects0']);
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

test('priority remains readable without color across task views and uses the same detail palette', () => {
 const priorities = ['urgent', 'high', 'medium', 'low'] as const;
 const titles = ['Urgent', 'High', 'Medium', 'Low'];
 const tasks = priorities.map((priority, index) => ({
  ...taskSchema.parse({title: `Task ${index + 1}`, priority, assigneeKey: 'ui-owner', dueDate: pmToday(), startedOn: pmToday()}),
  id: `priority-${priority}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const noop = () => {};
 const views = [
  <MobileTaskList tasks={tasks} projects={[]} meKey="ui-owner" onOpen={noop}/>,
  <RoadmapView tasks={tasks} projects={[]} onOpen={noop}/>,
  <TaskList tasks={tasks} projects={[]} onOpen={noop}/>,
  <TaskBoard tasks={tasks} projects={[]} selectedId={null} onSelect={noop} onMove={noop}/>,
  <DiagramView tasks={tasks} projects={[]} meId="ui-owner" onOpen={noop} onOpenProject={noop} onReorderTask={noop} onPatch={noop} onQuickAddTask={noop} onNewProject={noop} onReorderProject={noop}/>,
 ];
 assert.equal(new Set(Object.values(PRIORITY_COLOR)).size, 4);
 assert.deepEqual(PRIORITY_DOT, PRIORITY_COLOR);
 for (const view of views) {
  const {document} = parseHTML(renderToStaticMarkup(view));
  priorities.forEach((priority, index) => {
   const badge = document.querySelector(`[aria-label="${titles[index]} priority"]`);
   assert.equal(badge?.textContent, titles[index]);
   assert.ok(badge?.querySelector('svg[aria-hidden="true"]'));
   assert.ok(badge?.getAttribute('style')?.includes(PRIORITY_COLOR[priority]));
  });
 }
 const {document: calendar} = parseHTML(renderToStaticMarkup(<CalendarView tasks={tasks} projects={[]} onOpen={noop}/>));
 tasks.forEach((task, index) => {
  const bar = [...calendar.querySelectorAll('button')].find(button => button.getAttribute('title')?.startsWith(`${task.title} (`));
  assert.equal(bar?.textContent, `${titles[index]} · ${task.title}`);
  assert.ok(bar?.getAttribute('style')?.includes(PRIORITY_COLOR[task.priority]));
  const {document: detail} = parseHTML(renderToStaticMarkup(
   <CurrentUserProvider user={{id: 'ui-owner', fullName: 'Fixture User', email: 'fixture@example.test', role: 'admin', team: 'engineer', title: '', avatarUrl: null}}>
    <TaskDrawer task={task} projects={[]} comments={[]} onClose={noop} onPatch={noop} onDelete={noop} onConvert={noop} onAddComment={noop} onDeleteComment={noop}/>
   </CurrentUserProvider>,
  ));
  const select = detail.querySelector('select[aria-label="Priority"]');
  assert.equal(select?.querySelector('option[selected]')?.textContent, titles[index]);
  assert.ok(select?.parentElement?.getAttribute('style')?.includes(PRIORITY_COLOR[task.priority]));
 });
});
