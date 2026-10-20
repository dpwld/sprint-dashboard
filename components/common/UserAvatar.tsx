"use client";
import { Avatar } from '@/components/ds/core/Avatar';
import { TEAM_MEMBERS, memberName } from '@/lib/mock/team';
export function UserAvatar({memberKey,name,size='md',photo=true}: {memberKey?:string;name?:string;size?:'xs'|'sm'|'md'|'lg';photo?:boolean}) {
 const member = TEAM_MEMBERS.find(m=>m.id===memberKey);
 return <Avatar name={name ?? memberName(memberKey ?? '')} src={photo ? member?.avatarUrl : null} size={size}/>;
}
