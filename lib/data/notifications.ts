import { api } from './http';
export const insertMentionNotifications = (opts: {recipients:string[];actorKey:string;title:string;body:string;link:string}) => api<void>('notifications', opts);
