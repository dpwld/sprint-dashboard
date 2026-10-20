import {z} from 'zod';
import {context,failure,json} from '@/lib/server/context';
import {aiJson} from '@/lib/server/integrations';
export async function POST(request:Request){try{const {store,env}=await context(request);const input=z.object({rawTask:z.string().min(1).max(30000),due:z.string().optional()}).parse(await json(request));const order=await aiJson(env,store,'Create a practical work order for the supplied task. Return title, overview, sections (each heading and bullets array), deliverable, due. Preserve user language.',input,z.object({title:z.string(),overview:z.string(),sections:z.array(z.object({heading:z.string(),bullets:z.array(z.string())})),deliverable:z.string(),due:z.string()}));return Response.json(order);}catch(e){return failure(e);}}
