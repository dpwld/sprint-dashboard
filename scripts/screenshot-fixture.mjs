import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Explicit, local-only README screenshot data. Never imported by the service.
const base = new URL('http://127.0.0.1:4314');
assert.equal(base.protocol, 'http:');
assert.equal(base.hostname, '127.0.0.1');
const stateDirectory = fileURLToPath(new URL('../.wrangler/', import.meta.url));
const manifestPath = `${stateDirectory}screenshot-fixture.json`;
const mode = process.argv[2];
if (!['seed', 'cleanup'].includes(mode) || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/screenshot-fixture.mjs seed|cleanup');
}

async function request(path, method = 'GET', body) {
  assert.ok(path.startsWith('/api/pm/') && !path.includes('://'));
  const response = await fetch(new URL(path, base), {
    method,
    redirect: 'error',
    headers: {
      Cookie: '__sites_local_auth=1',
      Origin: base.origin,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  const result = await response.json();
  if (!response.ok && !(method === 'DELETE' && response.status === 404)) {
    throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  }
  return result;
}

async function readManifest() {
  try { return JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function persist(manifest) {
  await mkdir(stateDirectory, {recursive: true});
  await writeFile(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2));
  await rename(`${manifestPath}.tmp`, manifestPath);
}

const bootstrap = await request('/api/pm/bootstrap');
let manifest = await readManifest();
if (mode === 'cleanup') {
  if (!manifest) throw new Error('No fixture manifest exists; no records were changed.');
  assert.equal(manifest.base, base.origin);
  assert.equal(manifest.owner, bootstrap.user.id, 'Fixture belongs to a different local signed-in user');
  assert.match(manifest.namespace, /^readme-demo-[a-f0-9-]+$/);
  assert.ok(manifest.records.length <= 40);
  for (const record of manifest.records) {
    assert.ok(['members', 'projects', 'tasks', 'comments', 'logs'].includes(record.kind));
    assert.equal(typeof record.id, 'string');
    if (['projects', 'tasks'].includes(record.kind)) assert.ok(record.id.startsWith(`${manifest.namespace}-`));
  }
  const count = manifest.records.length;
  while (manifest.records.length) {
    const {kind, id} = manifest.records.at(-1);
    await request(`/api/pm/${kind}/${encodeURIComponent(id)}`, 'DELETE');
    manifest.records.pop();
    await persist(manifest);
  }
  await unlink(manifestPath);
  console.log(`Removed ${count} tracked fictional records from ${base.origin}. Unrelated records were preserved.`);
} else {
  if (manifest) throw new Error('A fixture manifest already exists. Run cleanup before creating another dataset.');
  const before = await request('/api/pm/workspace');
  manifest = {
    namespace: `readme-demo-${randomUUID()}`,
    base: base.origin,
    owner: bootstrap.user.id,
    description: 'Fictional demonstration data for README screenshots; local preview only.',
    records: [],
  };
  await persist(manifest);
  async function create(kind, body, key) {
    assert.ok(manifest.records.length < 40);
    const input = key ? {...body, id: `${manifest.namespace}-${key}`, restore: true} : body;
    const row = await request(`/api/pm/${kind}`, 'POST', input);
    manifest.records.push({kind, id: row.id});
    await persist(manifest);
    return row;
  }
  const today = new Date().toISOString().slice(0, 10);
  const day = offset => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const members = [];
  for (const [fullName, slug, title] of [
    ['Astrid Vale', 'astrid', 'Product design'],
    ['Milo Fern', 'milo', 'Frontend engineering'],
    ['Sora Finch', 'sora', 'Platform engineering'],
    ['Theo Moss', 'theo', 'Quality engineering'],
  ]) {
    members.push(await create('members', {fullName, email: `${slug}@sprint-demo.example`, title, team: 'engineer'}));
  }
  const projects = [];
  for (const [index, [name, description, owner, priority, target]] of [
    ['Reader workspace', 'Help readers find a saved note in under ten seconds. Deliver clear navigation, accessible search and a focused reading surface.', 0, 'high', 7],
    ['Reliable sync', 'Keep every edit safe when connectivity changes. Make offline recovery understandable and verify that reconnecting never loses a note.', 2, 'urgent', 10],
    ['Release readiness', 'Prepare a small, supportable public release with keyboard access, useful help content and a rehearsed recovery process.', 3, 'medium', 14],
  ].entries()) {
    projects.push(await create('projects', {
      name, description: `<p>${description}</p>`, ownerKey: members[owner].id,
      memberKeys: members.map(member => member.id), team: 'engineering',
      priority, targetDate: day(target), status: 'active', sort: index,
    }, `project-${index + 1}`));
  }
  const definitions = [
    [0, 'Map the reader navigation', 'done', 'high', 0, -2, 'Validate the route from library to note with five fictional reading scenarios.', ['Map primary routes', 'Review empty and error states', 'Record navigation decisions']],
    [0, 'Build keyboard-first search', 'in_progress', 'high', 1, 2, 'Open search with a shortcut, move through results and return focus to the originating note.', ['Add search shortcut', 'Implement arrow-key selection', 'Verify focus restoration']],
    [0, 'Review the reading typography', 'review', 'medium', 0, 1, 'Keep long notes readable at narrow and wide widths without changing their structure.', ['Check line length', 'Review heading hierarchy', 'Test 200% zoom']],
    [0, 'Add saved-filter shortcuts', 'todo', 'medium', 1, 6, 'Let readers return to their recent, starred and unfinished notes in one action.', ['Define filter names', 'Connect saved filters', 'Document keyboard shortcuts']],
    [0, 'Finish mobile note navigation', 'in_progress', 'high', 1, 3, 'Keep the note title and back action available while reading on a small screen.', ['Check touch targets', 'Preserve scroll position', 'Review portrait and landscape']],
    [1, 'Specify the offline edit queue', 'done', 'urgent', 2, -3, 'Define ordering, retry limits and recovery behavior for edits made without a network.', ['Write queue contract', 'Define conflict states', 'Review retry behavior']],
    [1, 'Preserve concurrent field edits', 'review', 'urgent', 2, 0, 'Save title and body updates independently so one successful update cannot erase the other.', ['Add concurrent-write case', 'Apply field updates', 'Review returned state']],
    [1, 'Show sync and retry status', 'in_progress', 'high', 1, 4, 'Explain whether an edit is saved, waiting for a connection or needs another attempt.', ['Add status messages', 'Keep drafts during retries', 'Check slow connections']],
    [1, 'Test reconnect recovery', 'todo', 'high', 3, 7, 'Verify that an interrupted edit remains intact after reconnecting and refreshing the page.', ['Create reconnect matrix', 'Test interrupted requests', 'Compare saved content']],
    [1, 'Settle attachment retry limits', 'hold', 'medium', 2, 5, 'Confirm a clear upload limit and retry policy before enabling large attachments.', ['Measure retry behavior', 'Review storage budget', 'Agree upload limit']],
    [2, 'Draft the first-run guide', 'done', 'medium', 0, -1, 'Explain how to create a note, organize it and find it again using concise examples.', ['Write three-step guide', 'Check labels against UI', 'Review plain language']],
    [2, 'Audit keyboard accessibility', 'in_progress', 'high', 3, 2, 'Complete the main reader journey without a pointer and record any focus traps.', ['Check tab order', 'Test dialogs and menus', 'Verify visible focus']],
    [2, 'Review account export content', 'review', 'medium', 2, 5, 'Make an export understandable and complete enough to restore the note collection.', ['Verify mandatory fields', 'Open exported archive', 'Review restoration notes']],
    [2, 'Rehearse release rollback', 'todo', 'high', 3, 9, 'Run a recovery rehearsal using fictional data and record the exact operator steps.', ['Prepare rollback steps', 'Run a rehearsal', 'Record recovery checks']],
    [2, 'Approve the release checklist', 'todo', 'low', 0, 12, 'Confirm ownership for documentation, accessibility, support and post-release checks.', ['Assign final checks', 'Review open blockers', 'Record release decision']],
  ];
  const tasks = [];
  for (const [index, [project, title, status, priority, assignee, due, goal, checks]] of definitions.entries()) {
    const completed = status === 'done' ? checks.length : status === 'review' ? 2 : status === 'in_progress' ? 1 : 0;
    tasks.push(await create('tasks', {
      title, description: `<p>${goal}</p>`, projectId: projects[project].id,
      team: 'engineering', assigneeKey: members[assignee].id, status, priority,
      startedOn: day(-7), dueDate: day(due), checkpointDate: day(Math.floor((-7 + due) / 2)),
      doneAt: status === 'done' ? `${day(due)}T16:00:00.000Z` : null,
      doneCriteria: 'The checklist is complete, the result is reviewed, and the decision is recorded.',
      checklist: checks.map((text, item) => ({text, done: item < completed})),
      sort: index,
    }, `task-${index + 1}`));
  }
  for (const [index, body] of [
    [1, 'Search shortcut and result navigation are working. Focus restoration is the next review item.'],
    [6, 'Concurrent title/body edits now retain both changes in the local verification scenario. Ready for review.'],
    [11, 'Completed the library-to-note keyboard journey. Dialog focus and escape behavior remain to be checked.'],
  ]) {
    await create('logs', {kind: 'task', targetId: tasks[index].id, logDate: today, body});
    await create('comments', {taskId: tasks[index].id, body: `${body} This discussion is fictional demonstration content.`});
  }
  for (const [index, body] of [
    'Navigation is agreed. Search, typography and mobile reading are progressing toward the first review.',
    'Queue behavior is specified. Concurrent edits are in review; attachment limits remain an explicit decision.',
    'The first-run guide is complete. Accessibility and export reviews will inform the release checklist.',
  ].entries()) {
    await create('logs', {kind: 'project', targetId: projects[index].id, logDate: today, body});
  }
  const after = await request('/api/pm/workspace');
  const directory = await request('/api/pm/members');
  assert.equal(after.projects.length, before.projects.length + 3);
  assert.equal(after.tasks.length, before.tasks.length + 15);
  assert.ok(before.projects.every(project => after.projects.some(row => row.id === project.id)));
  assert.ok(before.tasks.every(task => after.tasks.some(row => row.id === task.id)));
  assert.ok(members.every(member => directory.some(row => row.id === member.id)));
  const createdTasks = after.tasks.filter(task => task.id.startsWith(manifest.namespace));
  assert.equal(new Set(createdTasks.map(task => task.status)).size, 5);
  assert.deepEqual([...new Set(createdTasks.map(task => task.priority))].sort(), ['high', 'low', 'medium', 'urgent']);
  assert.ok(createdTasks.every(task => !/[가-힣]/.test(task.title)), 'README example task titles are English');
  console.log(`Created ${manifest.records.length} fictional records: 3 projects, 15 tasks, 4 members, 6 daily logs and 3 comments.`);
  console.log(`Preview: ${base.origin}/ — choose Engineering and Diagram or Board.`);
  console.log('All names and contacts are invented; email domains are reserved .example domains. No email or external integration was called.');
  console.log(`Manifest: ${manifestPath}`);
  console.log('After screenshots: node scripts/screenshot-fixture.mjs cleanup');
}
