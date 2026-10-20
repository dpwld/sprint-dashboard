import { requireChatGPTUser } from './chatgpt-auth';
import { ServiceShell } from '@/components/service/ServiceShell';
export default async function Page(){await requireChatGPTUser('/');return <ServiceShell/>;}
