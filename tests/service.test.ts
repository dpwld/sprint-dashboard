import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { Store } from '../lib/server/store';
import { saveRecord } from '../lib/server/records';
import { midpoint, taskSchema } from '../lib/server/domain';
import { integrationStatus, aiJson } from '../lib/server/integrations';
import { z } from 'zod';
import { rollup, compareTasks, isOverdue } from '../components/pm/pmFormat';
import { unmetSprintRules, pmToday } from '../lib/data/pm';
import { driveFolderId } from '../lib/server/drive-id';
import { applyReaction } from '../lib/data/reactions';
import type { PmTask } from '../types/domain';
import { parseHTML } from 'linkedom';
import { linkify, mentionify } from '../components/pm/memoText';
import { mentionSuggestions } from '../components/common/MentionComposer';
import { TEAM_MEMBERS, setMembers } from '../lib/mock/team';
import { refreshMentionNames } from '../lib/mentions';
let directory:string;let worker:Miniflare;let alice:Store;let bob:Store;let persistedId:string;
async function start(){worker=new Miniflare({modules:true,script:'export default { fetch(){return new Response("test")} }',d1Databases:['DB'],d1Persist:directory});const db=await worker.getD1Database('DB');alice=new Store(db as unknown as D1Database,'test-owner-a');bob=new Store(db as unknown as D1Database,'test-owner-b');return db;}
before(async()=>{directory=await mkdtemp(join(tmpdir(),'sprint-d1-'));const db=await start();const sql=await readFile('drizzle/0000_parched_leech.sql','utf8');for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();});
after(async()=>{await worker.dispose();await rm(directory,{recursive:true,force:true});});
test('D1 starts empty and only saves explicitly created records',async()=>{assert.deepEqual(await alice.list('tasks'),[]);assert.deepEqual(await alice.list('projects'),[]);const t=await saveRecord(alice,'tasks',{title:'Test task'});persistedId=t.id;assert.equal(t.title,'Test task');assert.equal(t.createdByKey,'test-owner-a');assert.equal((await alice.list('tasks')).length,1);});
test('owner isolation rejects reads, updates, deletes and foreign parent references',async()=>{assert.deepEqual(await bob.list('tasks'),[]);await assert.rejects(()=>bob.get('tasks',persistedId),/not found/);await assert.rejects(()=>saveRecord(bob,'tasks',{title:'Intrusion'},persistedId),/not found/);await assert.rejects(()=>bob.remove('tasks',persistedId),/not found/);const p=await saveRecord(alice,'projects',{name:'Private project'});await assert.rejects(()=>saveRecord(bob,'tasks',{title:'Foreign parent',projectId:p.id}),/not found/);assert.equal((await alice.get('tasks',persistedId)).title,'Test task');});
test('invalid titles, dates and assignments preserve existing values',async()=>{await assert.rejects(()=>saveRecord(alice,'tasks',{title:'  '},persistedId));await assert.rejects(()=>saveRecord(alice,'tasks',{dueDate:'2026-02-30'},persistedId));await assert.rejects(()=>saveRecord(alice,'tasks',{assigneeKey:'unknown-member'},persistedId));assert.equal((await alice.get('tasks',persistedId)).title,'Test task');assert.equal((await alice.get('tasks',persistedId)).dueDate,null);});
test('date checkpoints, done boundaries and rich HTML are saved correctly',async()=>{const t=await saveRecord(alice,'tasks',{title:'Deadline test',startedOn:'2026-10-01',dueDate:'2026-10-11',description:'<p>Objective</p><script>alert(1)</script>',memo:'<img src="x" onerror="alert(1)"><b>Memo</b>'});assert.equal(t.checkpointDate,'2026-10-06');assert.equal(t.description,'<p>Objective</p>');assert.ok(!String(t.memo).includes('onerror'));const done=await saveRecord(alice,'tasks',{status:'done'},t.id);assert.ok(done.doneAt);const reopened=await saveRecord(alice,'tasks',{status:'todo'},t.id);assert.equal(reopened.doneAt,null);});
test('project deletion atomically detaches tasks and removes associated logs',async()=>{const p=await saveRecord(alice,'projects',{name:'Delete test'});const t=await saveRecord(alice,'tasks',{title:'Retained task',projectId:p.id});await alice.create('logs',{kind:'project',targetId:p.id,body:'Progress'});await alice.remove('projects',p.id);assert.equal((await alice.get('tasks',t.id)).projectId,null);assert.ok(!(await alice.list('logs')).some(l=>l.targetId===p.id));});
test('task deletion cascades comments, reactions and logs; undo restores exact contract',async()=>{const t=await saveRecord(alice,'tasks',{title:'Undo test',checkpointDate:'2026-10-05',doneCriteria:'Reviewed'});const c=await alice.create('comments',{taskId:t.id,body:'Comment'});await alice.create('reactions',{targetId:c.id,emoji:'👍',userKey:alice.owner});await alice.create('logs',{targetId:t.id,kind:'task',body:'Progress'});await alice.remove('tasks',t.id);assert.ok(!(await alice.list('comments')).some(x=>x.id===c.id));assert.ok(!(await alice.list('reactions')).some(x=>x.targetId===c.id));assert.ok(!(await alice.list('logs')).some(x=>x.targetId===t.id));const restored=await saveRecord(alice,'tasks',{...t,restore:true});assert.equal(restored.id,t.id);assert.equal(restored.checkpointDate,'2026-10-05');assert.equal(restored.doneCriteria,'Reviewed');await assert.rejects(()=>saveRecord(alice,'tasks',{...t,restore:true}),/already exists/);});
test('stored data survives local D1 process restart',async()=>{await worker.dispose();await start();assert.equal((await alice.get('tasks',persistedId)).title,'Test task');assert.deepEqual(await bob.list('tasks'),[]);});
test('unconfigured paid integration fails precisely without a provider request',async()=>{assert.equal(integrationStatus({},alice.owner).ai.ready,false);await assert.rejects(()=>aiJson({},alice,'test',{},z.object({ok:z.boolean()})),/OPENAI_API_KEY/);assert.deepEqual(await alice.list('integrationRuns'),[]);});
test('original sorting, rollup, sprint rules and optimistic reactions are preserved',()=>{assert.equal(midpoint('2026-10-01','2026-10-11'),'2026-10-06');const base=taskSchema.parse({title:'Fixture',startedOn:pmToday()});const a={...base,id:'a',createdAt:'',updatedAt:'',status:'todo',dueDate:'2000-01-01'} as PmTask;const b={...a,id:'b',status:'hold'} as PmTask;assert.equal(isOverdue(a),true);assert.equal(isOverdue(b),false);assert.ok(compareTasks(a,b)<0);assert.deepEqual(rollup([a,{...a,status:'done'}]),{done:1,total:2,pct:50});assert.equal(unmetSprintRules(a).length,3);assert.deepEqual(applyReaction([{emoji:'👍',userIds:['a']}],'a','👍',false),[]);});

test("Drive adapter accepts original full-folder links and rejects other hosts",()=>{assert.equal(driveFolderId("folder-test"),"folder-test");assert.equal(driveFolderId("https://drive.google.com/drive/folders/folder-test?usp=sharing"),"folder-test");assert.equal(driveFolderId("https://example.test/drive/folders/other"),null);});

test('concurrent independent task patches retain both edits and explicit nulls', async () => {
 const task = await saveRecord(alice, 'tasks', {title: 'Concurrent edit', startedOn: '2026-10-01', dueDate: '2026-10-11'});
 let reads = 0;
 let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 class ConcurrentStore extends Store {
  override async get(kind: string, id: string) {
   const row = await super.get(kind, id);
   if (kind === 'tasks' && id === task.id && reads < 2) {
    reads++;
    if (reads === 2) release();
    await gate;
   }
   return row;
  }
 }
 const store = new ConcurrentStore(alice.db, alice.owner);
 await Promise.all([
  saveRecord(store, 'tasks', {description: '<p>Saved objective</p>'}, task.id),
  saveRecord(store, 'tasks', {status: 'done'}, task.id),
 ]);
 const saved = await alice.get('tasks', task.id);
 assert.equal(saved.description, '<p>Saved objective</p>');
 assert.equal(saved.status, 'done');
 assert.ok(saved.doneAt);
 await saveRecord(alice, 'tasks', {checkpointDate: null, doneAt: null}, task.id);
 await saveRecord(alice, 'tasks', {title: 'Later independent edit'}, task.id);
 const cleared = await alice.get('tasks', task.id);
 assert.equal(cleared.checkpointDate, null);
 assert.equal(cleared.doneAt, null);
});

test('memo text formatting keeps escaped markup inert and preserves real links and mentions', () => {
 const {document} = parseHTML('<html><body></body></html>');
 Object.assign(globalThis, {document, NodeFilter: {SHOW_TEXT: 4}});
 const previous = [...TEAM_MEMBERS];
 try {
  setMembers([{id: 'fixture-member', fullName: 'Review Member', title: '', email: 'fixture@example.test', role: 'member', team: 'engineer', avatarUrl: null}]);
  refreshMentionNames();
  const root = document.createElement('div');
  const text = '<img src=x onerror="alert(1)"> https://example.test/path @Review <svg onload="alert(2)">';
  root.textContent = text;
  linkify(root);
  mentionify(root);
  linkify(root);
  mentionify(root);
  assert.equal(root.textContent, text);
  assert.equal(root.querySelectorAll('img,svg,[onerror],[onload]').length, 0);
  assert.equal(root.querySelectorAll('a').length, 1);
  assert.equal(root.querySelector('a')?.getAttribute('href'), 'https://example.test/path');
  assert.equal(root.querySelectorAll('[data-mention]').length, 1);
  assert.equal(root.querySelector('[data-mention]')?.textContent, '@Review');
 } finally {
  setMembers(previous);
  refreshMentionNames();
  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(globalThis, 'NodeFilter');
 }
});

test('mention suggestions use directory loaded after module initialization and later updates', () => {
 const previous = [...TEAM_MEMBERS];
 try {
  setMembers([]);
  assert.deepEqual(mentionSuggestions(''), []);
  setMembers([{id: 'fixture-member', fullName: 'Review Member', title: 'Reviewer', email: 'fixture@example.test', role: 'member', team: 'engineer', avatarUrl: null}]);
  assert.deepEqual(mentionSuggestions('rev'), [{key: 'fixture-member', fullName: 'Review Member', title: 'Reviewer'}]);
  setMembers([]);
  assert.deepEqual(mentionSuggestions('rev'), []);
 } finally { setMembers(previous); }
});
