import { z } from 'zod';
import { context, failure, json } from '@/lib/server/context';
import { ServiceError } from '@/lib/server/store';
import { saveRecord } from '@/lib/server/records';
import { memberSchema, commentSchema, logSchema } from '@/lib/server/domain';
import { aiJson, integrationStatus, sendMail } from '@/lib/server/integrations';
const response=(data:unknown)=>Response.json(data??{ok:true});
async function handle(request:Request) {
 try {
 const {user,store,env}=await context(request); const url=new URL(request.url); const [kind,id]=url.pathname.replace('/api/pm/','').split('/');
 if(request.method==='GET'){
  if(kind==='bootstrap')return response({user:{id:user.userId,email:user.email,fullName:user.displayName,team:'engineer',title:'',role:'admin',avatarUrl:null},members:await store.list('members'),integrations:integrationStatus(env,user.userId)});
  if(kind==='workspace'){const [projects,tasks,comments]=await Promise.all(['projects','tasks','comments'].map(k=>store.list(k)));return response({projects:projects.sort((a,b)=>Number(a.sort)-Number(b.sort)),tasks,sprints:[],comments});}
  if(kind==='logs')return response((await store.list('logs')).filter(r=>r.kind===url.searchParams.get('kind')&&r.targetId===url.searchParams.get('targetId')).sort((a,b)=>String(b.logDate).localeCompare(String(a.logDate))));
  if(kind==='reactions'){const ids=(url.searchParams.get('ids')??'').split(',');const grouped:Record<string,{emoji:string,userIds:string[]}[]>={};for(const r of await store.list('reactions')){if(ids[0]&&!ids.includes(String(r.targetId)))continue;const list=grouped[String(r.targetId)]??=[];const reaction=list.find(x=>x.emoji===r.emoji);if(reaction)reaction.userIds.push(String(r.userKey));else list.push({emoji:String(r.emoji),userIds:[String(r.userKey)]});}return response(grouped);}
  if(['members','i18n','notifications','integrationRuns'].includes(kind))return response(await store.list(kind));
 }
 if(request.method==='DELETE'&&id&&['tasks','projects','comments','logs','members'].includes(kind)){
  if(kind==='members'){const tasks=await store.list('tasks');const projects=await store.list('projects');if(tasks.some(t=>t.assigneeKey===id)||projects.some(p=>p.ownerKey===id||(p.memberKeys as string[]).includes(id)||(p.coOwnerKeys as string[]).includes(id)))throw new ServiceError(409,'Reassign this member’s tasks and projects before deleting them');}
  await store.remove(kind,id);return response(null);
 }
 const body=z.record(z.unknown()).parse(await json(request));
 if(['tasks','projects'].includes(kind)&&['POST','PATCH'].includes(request.method))return response(await saveRecord(store,kind as 'tasks'|'projects',body,request.method==='PATCH'?id:undefined));
 if(kind==='members'&&request.method==='POST')return response(await store.create(kind,memberSchema.parse(body)));
 if(kind==='members'&&request.method==='PATCH'&&id){const before=await store.get(kind,id);const {id:_id,createdAt,updatedAt,...fields}=before;const data=memberSchema.parse({...fields,...body});const patch=Object.fromEntries(Object.entries(data).filter(([key])=>Object.hasOwn(body,key)));return response(await store.update(kind,id,patch));}
 if(kind==='comments'){const parsed=commentSchema.parse(body);await store.get('tasks',parsed.taskId);return response(await store.create(kind,{...parsed,authorKey:user.userId}));}
 if(kind==='logs'){const parsed=logSchema.parse(body);await store.get(parsed.kind==='task'?'tasks':'projects',parsed.targetId);return response(await store.create(kind,{...parsed,authorKey:user.userId}));}
 if(kind==='reactions'){
  const p=z.object({kind:z.literal('pm_comment'),targetId:z.string(),userKey:z.string().optional(),emoji:z.string().min(1).max(20),on:z.boolean()}).parse(body);await store.get('comments',p.targetId);
  const rows=await store.list('reactions');const existing=rows.find(r=>r.targetId===p.targetId&&r.userKey===user.userId&&r.emoji===p.emoji);
  if(p.on&&!existing)await store.create(kind,{...p,userKey:user.userId});if(!p.on&&existing)await store.remove(kind,existing.id);return response(null);
 }
 if(kind==='i18n'){
  const parsed=z.object({rows:z.array(z.object({kind:z.enum(['task','project','text']),targetId:z.string().max(200),lang:z.enum(['ko','en']),source:z.string().max(500000),text:z.string().max(500000)})).max(200)}).parse(body);
  const existing=await store.list('i18n');for(const row of parsed.rows){const match=existing.find(r=>r.kind===row.kind&&r.targetId===row.targetId&&r.lang===row.lang);if(match)await store.update(kind,match.id,row);else await store.create(kind,row);}return response(null);
 }
 if(kind==='notifications'){
  const parsed=z.object({recipients:z.array(z.string()).max(100),title:z.string().max(1000),body:z.string().max(2000),link:z.string().startsWith('/').max(2000).refine(value=>!value.startsWith('//'),'Use a relative workspace link'),actorKey:z.string().optional()}).parse(body);
  for(const recipient of parsed.recipients){if(recipient!==user.userId)await store.get('members',recipient);await store.create(kind,{...parsed,recipient,actorKey:user.userId,read:false});}return response(null);
 }
 if(kind==='notify')return response(await sendMail(env,store,body,user.email));
 if(kind==='translate'){
  const parsed=z.object({target:z.enum(['ko','en']),items:z.array(z.object({id:z.string().max(200),text:z.string().max(10000)})).max(100)}).parse(body);
  return response(await aiJson(env,store,'Translate each text into the target language. Preserve IDs. Return {"items":[{"id":"...","text":"..."}]}.',parsed,z.object({items:z.array(z.object({id:z.string(),text:z.string()}))})));
 }
 if(kind==='assign-projects'){
  const parsed=z.object({tasks:z.array(z.object({id:z.string(),title:z.string()})).max(200),projects:z.array(z.object({id:z.string(),name:z.string(),description:z.string()})).max(100)}).parse(body);
  for(const t of parsed.tasks)await store.get('tasks',t.id);for(const p of parsed.projects)await store.get('projects',p.id);
  return response(await aiJson(env,store,'Match tasks to the supplied projects only when confident. Leave uncertain tasks out. Return {"assignments":[{"taskId":"...","projectId":"..."}]}.',parsed,z.object({assignments:z.array(z.object({taskId:z.string(),projectId:z.string()}))})));
 }
 if(kind==='grant-import'){
  const p=z.object({title:z.string().trim().min(1).max(1000),description:z.string().max(100000).default(''),dueDate:z.string().nullable().optional(),priority:z.enum(['urgent','high','medium','low']).default('medium'),sourceUrl:z.string().url().refine(v=>/^https?:\/\//.test(v)).optional(),grantId:z.string().min(1).max(300)}).parse(body);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${user.userId}:grant:${p.grantId}`));const stable='grant-'+Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  try{return response(await store.get('tasks',stable));}catch(error){if(!(error instanceof ServiceError&&error.status===404))throw error;}
  return response(await saveRecord(store,'tasks',{id:stable,restore:true,title:p.title,description:p.description,dueDate:p.dueDate??null,priority:p.priority,attachments:p.sourceUrl?[{kind:'link',name:'Grant source',url:p.sourceUrl,storagePath:''}]:[]}));
 }
 throw new ServiceError(404,'Endpoint not found');
 }catch(error){return failure(error);}
}
export const GET=handle;export const POST=handle;export const PATCH=handle;export const DELETE=handle;
