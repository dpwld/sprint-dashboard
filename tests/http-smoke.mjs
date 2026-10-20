import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:4314';
const cookie='__sites_local_auth=1';const created=[];
async function request(path,body,method=body===undefined?'GET':'POST',extra={}){const response=await fetch(base+path,{method,headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await response.text();let result;try{result=JSON.parse(text);}catch{result={error:text};}return {status:response.status,data:result};}
try{
 const unsigned=await fetch(base+'/api/pm/workspace');assert.equal(unsigned.status,401);
 const spoof=await fetch(base+'/api/pm/workspace',{headers:{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':'fake@example.test'}});assert.equal(spoof.status,401);
 const blocked=await request('/api/pm/tasks',{title:'Blocked'},'POST',{Origin:'https://example.test'});assert.equal(blocked.status,403);
 const p=await request('/api/pm/projects',{name:'HTTP test project'});assert.equal(p.status,200);created.push(['projects',p.data.id]);
 const t=await request('/api/pm/tasks',{title:'HTTP test task',projectId:p.data.id,dueDate:'2026-12-10'});assert.equal(t.status,200);created.push(['tasks',t.data.id]);
 assert.equal((await request(`/api/pm/tasks/${t.data.id}`,{title:''},'PATCH')).status,400);
 const c=await request('/api/pm/comments',{taskId:t.data.id,authorKey:'spoofed',body:'HTTP comment'});assert.equal(c.status,200);assert.notEqual(c.data.authorKey,'spoofed');
 const log=await request('/api/pm/logs',{kind:'task',targetId:t.data.id,logDate:'2026-10-20',body:'Progress'});assert.equal(log.status,200);
 assert.equal((await request('/api/pm/reactions',{kind:'pm_comment',targetId:c.data.id,emoji:'👍',on:true})).status,200);
 const grouped=await request('/api/pm/reactions?ids='+c.data.id);assert.equal(grouped.data[c.data.id][0].emoji,'👍');
 const trans=await request('/api/pm/translate',{target:'ko',items:[{id:'test',text:'hello'}]});assert.equal(trans.status,503);assert.match(trans.data.error,/OPENAI_API_KEY/);
 const work=await request('/api/work-order',{rawTask:'Test'});assert.equal(work.status,503);
 const data=new FormData();data.append('file',new File(['HTTP file bytes'],'test.txt',{type:'text/plain'}));const uploaded=await fetch(base+'/api/files',{method:'POST',headers:{Cookie:cookie},body:data});assert.equal(uploaded.status,200);const file=await uploaded.json();created.push(['files',file.path]);const download=await fetch(base+'/api/files?path='+file.path,{headers:{Cookie:cookie}});assert.equal(await download.text(),'HTTP file bytes');assert.equal(download.headers.get('content-disposition').startsWith('attachment'),true);
 const grant={title:'Grant import test',grantId:'http-smoke-grant-id',description:'Review handoff',priority:'high'};const first=await request('/api/pm/grant-import',grant);assert.equal(first.status,200);created.push(['tasks',first.data.id]);const second=await request('/api/pm/grant-import',grant);assert.equal(second.status,200);assert.equal(first.data.id,second.data.id);
 const workspace=await request('/api/pm/workspace');assert.equal(workspace.data.tasks.find(x=>x.id===t.data.id).title,'HTTP test task');
 console.log('HTTP smoke passed: auth, spoof prevention, CSRF, CRUD validation, author identity, comments, logs, reactions, missing AI setup, R2 upload/download, idempotent grant import.');
}finally{for(const [kind,id] of created.reverse()){const path=kind==='files'?`/api/files?path=${id}`:`/api/pm/${kind}/${id}`;const result=await request(path,undefined,'DELETE');assert.equal(result.status,200,`Cleanup ${kind} ${id}: ${JSON.stringify(result.data)}`);}}
