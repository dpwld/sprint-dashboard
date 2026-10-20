import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { GrantImport } from './review';
export default async function Page({searchParams}:{searchParams:Promise<{payload?:string}>}){const query=await searchParams;await requireChatGPTUser(`/import/grant?payload=${encodeURIComponent(query.payload??'')}`);return <GrantImport payload={query.payload??''}/>;}
