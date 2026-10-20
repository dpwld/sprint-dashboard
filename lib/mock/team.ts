import type { User } from '@/types/domain';
// Compatibility contract for original view imports. Populated exclusively from authenticated server records.
export const TEAM_MEMBERS: User[] = [];
export function setMembers(members: User[]) { TEAM_MEMBERS.splice(0, TEAM_MEMBERS.length, ...members); }
export const memberName = (key: string) => TEAM_MEMBERS.find(m => m.id === key)?.fullName ?? (key ? 'Unknown member' : 'Unassigned');
