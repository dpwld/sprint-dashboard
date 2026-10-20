import sanitizeHtml from 'sanitize-html';
import { driveFolderId } from './drive-id';
import { Store, ServiceError, type RecordData } from './store';
import { taskSchema, projectSchema, midpoint } from './domain';
const cleanHtml=(text:string)=>sanitizeHtml(text,{allowedTags:[...sanitizeHtml.defaults.allowedTags,'img','input','del'],allowedAttributes:{...sanitizeHtml.defaults.allowedAttributes,'*':['style','data-mention','data-path','data-resize'],img:['src','alt','width','height','data-path'],input:['type','checked','disabled']},allowedStyles:{'*':{'color':[/^#[\da-f]{3,8}$/i,/^var\(--[\w-]+\)$/],'background-color':[/^#[\da-f]{3,8}$/i],'text-align':[/^(left|right|center)$/],'width':[/^\d+(%|px)$/],'font-weight':[/^\d{3}$/]}},allowedSchemes:['http','https'],allowProtocolRelative:false});
export async function saveRecord(store:Store,kind:'tasks'|'projects',input:Record<string,unknown>,id?:string) {
 const before=id?await store.get(kind,id):null;
 const restore=input.restore===true; const clean={...input};delete clean.restore;
 const data=(kind==='tasks'?taskSchema:projectSchema).parse({...before,...clean});
 const changed=new Set(Object.keys(clean).filter(key=>clean[key]!==undefined));
 if(!id && !restore){delete data.id;delete data.createdAt;}
 data.createdByKey=before?.createdByKey as string ?? store.owner;
 data.description=cleanHtml(data.description);
 if(data.driveFolder&&!driveFolderId(data.driveFolder))throw new ServiceError(400,"Enter a valid Google Drive folder URL or ID");
 if(kind==='tasks'){
  const t=data as ReturnType<typeof taskSchema.parse>;
  if(t.projectId)await store.get('projects',t.projectId);
  if(t.sprintId)throw new ServiceError(400,'Sprint timeboxes are not exposed by this workspace; leave sprintId empty');
  if(t.assigneeKey && t.assigneeKey!==store.owner) await store.get('members',t.assigneeKey);
  if(!id&&!restore&&!t.startedOn)t.startedOn=new Date().toISOString().slice(0,10);
  if(!t.checkpointDate && clean.checkpointDate===undefined && (!id || changed.has('startedOn') || changed.has('dueDate'))){t.checkpointDate=midpoint(t.startedOn,t.dueDate);changed.add('checkpointDate');}
  if(clean.status!==undefined && clean.doneAt===undefined){t.doneAt=t.status==='done'?new Date().toISOString():null;changed.add('doneAt');}
  t.memo=cleanHtml(t.memo);
  for(const attachment of t.attachments)if(attachment.storagePath)await store.get('files',attachment.storagePath);
 }else{
  const p=data as ReturnType<typeof projectSchema.parse>;
  for(const member of [p.ownerKey,...p.coOwnerKeys,...p.memberKeys].filter(Boolean))if(member!==store.owner)await store.get('members',member);
 }
 const patch=Object.fromEntries(Object.entries(data).filter(([key])=>changed.has(key)));
 const result=id?await store.update(kind,id,patch):await store.create(kind,data,restore?data.id:undefined);
 return result as RecordData;
}
