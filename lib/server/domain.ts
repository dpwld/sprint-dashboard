import { z } from 'zod';
export const team = z.enum(['engineering','manufacturing','business']);
const short = z.string().max(1000);
const rich = z.string().max(500000);
const key = z.string().max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(`${v}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === v; }, 'Invalid calendar date');
export const priority = z.enum(['urgent','high','medium','low']);
const optionalDate = date.nullable().default(null);
const httpUrl = z.string().max(4000).refine(v => !v || /^https?:\/\//.test(v), 'URL must use http or https');
export const taskSchema = z.object({
 title: short.trim().min(1), description: rich.default(''), team: team.default('engineering'),
 projectId: key.nullable().default(null), sprintId: key.nullable().default(null), assigneeKey: key.default(''),
 status: z.enum(['todo','in_progress','review','hold','done']).default('todo'), priority: priority.default('medium'),
 dueDate: optionalDate, startedOn: optionalDate, checkpointDate: optionalDate, doneCriteria: rich.default(''),
 checklist: z.array(z.object({text:short,done:z.boolean()})).max(500).default([]),
 driveFolder: z.string().max(4000).default(''), memo: rich.default(''),
 attachments: z.array(z.object({kind:z.enum(['image','file','link']),name:short,url:httpUrl.or(z.literal('')).default(''),storagePath:z.string().max(1000).default('')})).max(100).default([]),
 sort: z.number().finite().default(0), doneAt: z.string().datetime().nullable().default(null),
 createdByKey: key.default(''), createdAt: z.string().optional(), updatedAt: z.string().optional(), id: key.optional(),
}).strict();
export const projectSchema = z.object({
 name: short.trim().min(1), description:rich.default(''), status:z.enum(['active','paused','done','archived']).default('active'),
 priority:priority.default('medium'),team:team.default('engineering'),ownerKey:key.default(''),coOwnerKeys:z.array(key).max(200).default([]),
 visibility:z.enum(['team','private']).default('team'),memberKeys:z.array(key).max(500).default([]),targetDate:optionalDate,
 driveFolder:z.string().max(4000).default(''),sort:z.number().finite().default(0),createdByKey:key.default(''),createdAt:z.string().optional(),updatedAt:z.string().optional(),id:key.optional(),
}).strict();
export const memberSchema = z.object({fullName:short.trim().min(1), email:z.string().email().max(320),team:z.enum(['engineer','exec','support','manufacturing']).default('engineer'), title:short.default(''), role:z.literal('member').default('member'), avatarUrl:z.null().default(null)}).strict();
export const commentSchema = z.object({taskId:key.min(1),authorKey:key.optional(),body:rich.trim().min(1)}).strict();
export const logSchema = z.object({kind:z.enum(['project','task']),targetId:key.min(1),logDate:date,body:rich.trim().min(1),authorKey:key.optional()}).strict();
export function midpoint(start: string | null, due: string | null): string | null {
 if (!start || !due || due < start) return null;
 return new Date((Date.parse(`${start}T00:00:00Z`)+Date.parse(`${due}T00:00:00Z`))/2).toISOString().slice(0,10);
}
