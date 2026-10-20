import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { Store, ServiceError } from './store';
import { ZodError } from 'zod';
export async function context(request:Request) {
 const user=await getChatGPTUser(); if(!user)throw new ServiceError(401,'Sign in with ChatGPT to access your workspace');
 if(!['GET','HEAD'].includes(request.method)) {
  const origin=request.headers.get('origin'); if(origin && origin!==new URL(request.url).origin)throw new ServiceError(403,'Cross-origin writes are not allowed');
 }
 if(!env.DB)throw new ServiceError(503,'D1 binding DB is not configured');
 return {user,store:new Store(env.DB,user.userId),env:env as typeof env & Record<string,unknown>};
}
export function failure(error:unknown) {
 if(error instanceof ZodError) return Response.json({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},{status:400});
 if(error instanceof ServiceError) return Response.json({error:error.message},{status:error.status});
 console.error('Service request failed',error); return Response.json({error:'The request could not be saved. Please retry.'},{status:500});
}
export async function json(request:Request) { if(Number(request.headers.get('content-length')||0)>1_000_000)throw new ServiceError(413,'Request is too large'); try{return await request.json();}catch{throw new ServiceError(400,'Invalid JSON body');} }
