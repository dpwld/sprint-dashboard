export type Stored = {id:string;owner_id:string;kind:string;data:string;created_at:string;updated_at:string;version:number};
export type RecordData = Record<string, unknown> & {id:string};
export class ServiceError extends Error { constructor(public status:number,message:string) { super(message); } }
export class Store {
 constructor(readonly db: D1Database,readonly owner:string) {}
 async list(kind:string):Promise<RecordData[]> { const rows=await this.db.prepare('SELECT data FROM records WHERE owner_id = ? AND kind = ? ORDER BY created_at').bind(this.owner,kind).all<{data:string}>(); return rows.results.map(r=>JSON.parse(r.data)); }
 async get(kind:string,id:string):Promise<RecordData> { const row=await this.db.prepare('SELECT data FROM records WHERE owner_id = ? AND kind = ? AND id = ?').bind(this.owner,kind,id).first<{data:string}>();if(!row)throw new ServiceError(404,'Record not found');return JSON.parse(row.data); }
 async create(kind:string,data:Record<string,unknown>,id=crypto.randomUUID()):Promise<RecordData> {
  const now=new Date().toISOString(); const row={...data,id,createdAt:data.createdAt ?? now,updatedAt:now};
  try { await this.db.prepare('INSERT INTO records (id, owner_id, kind, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id,this.owner,kind,JSON.stringify(row),now,now).run(); }
  catch(e){ if(String(e).includes('UNIQUE')) throw new ServiceError(409,'Record already exists'); throw e; }
  return row;
 }
 async update(kind:string,id:string,data:Record<string,unknown>):Promise<RecordData> {
  const now=new Date().toISOString();
  const patch=Object.entries({...data,updatedAt:now}).filter(([key,value])=>!['id','createdAt','createdByKey'].includes(key)&&value!==undefined);
  const args=patch.flatMap(([key,value])=>[`$.${JSON.stringify(key)}`,JSON.stringify(value)]);
  const result=await this.db.prepare(`UPDATE records SET data = json_set(data, ${patch.map(()=> '?, json(?)').join(', ')}), updated_at = ?, version = version + 1 WHERE owner_id = ? AND kind = ? AND id = ? RETURNING data`).bind(...args,now,this.owner,kind,id).first<{data:string}>();
  if(!result) throw new ServiceError(404,'Record not found'); return JSON.parse(result.data);
 }
 async remove(kind:string,id:string):Promise<void> {
  await this.get(kind,id);
  const commands:D1PreparedStatement[]=[];
  if(kind==='projects') {
   const now=new Date().toISOString();
   commands.push(this.db.prepare("UPDATE records SET data = json_set(data, '$.projectId', json('null'), '$.updatedAt', ?), updated_at = ?, version = version + 1 WHERE owner_id = ? AND kind = 'tasks' AND json_extract(data, '$.projectId') = ?").bind(now,now,this.owner,id));
  }
  if(kind==='tasks'){
   const comments=(await this.list('comments')).filter(c=>c.taskId===id);
   for(const c of comments)commands.push(this.db.prepare('DELETE FROM records WHERE owner_id = ? AND (id = ? OR (kind = ? AND json_extract(data, \'$.targetId\') = ?))').bind(this.owner,c.id,'reactions',c.id));
  }
  if(kind==='tasks'||kind==='projects') commands.push(this.db.prepare('DELETE FROM records WHERE owner_id = ? AND kind = ? AND json_extract(data, \'$.targetId\') = ?').bind(this.owner,'logs',id));
  if(kind==='comments')commands.push(this.db.prepare('DELETE FROM records WHERE owner_id = ? AND kind = ? AND json_extract(data, \'$.targetId\') = ?').bind(this.owner,'reactions',id));
  commands.push(this.db.prepare('DELETE FROM records WHERE owner_id = ? AND kind = ? AND id = ?').bind(this.owner,kind,id));
  await this.db.batch(commands);
 }
}
