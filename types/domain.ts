export type Team = "engineer" | "exec" | "support" | "manufacturing";
export type Role = "member" | "admin";

export interface User {
  id: string;
  email: string;
  fullName: string;
  team: Team;
  /** Free-form job title, e.g. "Sales engineer", "CEO". */
  title: string;
  role: Role;
  avatarUrl: string | null;
  /** Per-user tool-access overrides (toolKey → allowed). Empty = team defaults.
     Set by admins on the Admin page; read by canAccess. */
  toolAccess?: Record<string, boolean>;
  /** Stored tool defaults (app_settings) resolved for this user's team at
     load time — canAccess falls back here before the built-in defaults. */
  defaultAccess?: Record<string, boolean>;
}


export interface Reaction {
  emoji: string;
  userIds: string[];
}

export type PmProjectStatus = "active" | "paused" | "done" | "archived";
export type PmSprintStatus = "planned" | "active" | "closed";
export type PmTaskStatus = "todo" | "in_progress" | "review" | "hold" | "done";
export type PmPriority = "urgent" | "high" | "medium" | "low";

export interface PmChecklistItem {
  text: string;
  done: boolean;
}

/** 태스크 메모 첨부 — 업로드 파일/이미지(storagePath, docs 버킷 sprint/ 경로)
   또는 외부 링크(url). */
export interface PmAttachment {
  kind: "image" | "file" | "link";
  name: string;
  url: string;
  storagePath: string;
}

/** 장기 과제(에픽). 진행률 컬럼은 없고 하위 태스크에서 rollup으로 계산. */
/** Sprint 작업공간의 팀 파티션 (프로젝트/태스크가 소속되는 스프린트 보드). */
export type PmTeam = "engineering" | "manufacturing" | "business";

export interface PmProject {
  id: string;
  name: string;
  description: string;
  status: PmProjectStatus;
  /** 프로젝트 우선순위 — Diagram 폴더 색을 좌우한다 (2026-08-12 SQL). */
  priority: PmPriority;
  team: PmTeam;
  /** Project DRI member key (member-key, …). */
  ownerKey: string;
  /** 부담당자 — 2명 이상 지정 가능 (2026-08-19 SQL). */
  coOwnerKeys: string[];
  /** 'private'면 owner·co-owner·memberKeys·admin만 프로젝트(와 그 태스크)를 본다. */
  visibility: "team" | "private";
  /** private 프로젝트를 볼 수 있는 추가 멤버. */
  memberKeys: string[];
  /** yyyy-mm-dd or null — 스프린트와 무관한 장기 목표일. */
  targetDate: string | null;
  /** Google Drive folder URL/ID — 대시보드에서 내용 탐색(browse). */
  driveFolder: string;
  sort: number;
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}

/** 2주 타임박스. */
export interface PmSprint {
  id: string;
  name: string;
  goal: string;
  /** yyyy-mm-dd */
  startsOn: string;
  /** yyyy-mm-dd */
  endsOn: string;
  status: PmSprintStatus;
  closedAt: string | null;
  createdAt: string;
}

/** 실행 단위 — 담당자 1명(DRI). sprintId null = 백로그. */
export interface PmTask {
  id: string;
  title: string;
  description: string;
  team: PmTeam;
  projectId: string | null;
  sprintId: string | null;
  assigneeKey: string;
  status: PmTaskStatus;
  priority: PmPriority;
  /** yyyy-mm-dd or null. */
  dueDate: string | null;
  /** yyyy-mm-dd — auto-set to the creation day; editable. Drives the Roadmap. */
  startedOn: string | null;
  /** 중간 보고 시점 (스프린트 법칙 ②, 2026-09-22b SQL). */
  checkpointDate: string | null;
  /** 완성의 기준 — 어느 수준이면 끝인가 (법칙 ③). */
  doneCriteria: string;
  checklist: PmChecklistItem[];
  /** Google Drive folder URL/ID — 대시보드에서 내용 탐색. */
  driveFolder: string;
  /** 기타 내용 자유 메모 (설명과 별개). */
  memo: string;
  attachments: PmAttachment[];
  sort: number;
  doneAt: string | null;
  createdByKey: string;
  createdAt: string;
  updatedAt: string;
}

/** 프로젝트/태스크 daily log — 날짜별 한 줄 진행 기록. */
export interface PmDailyLog {
  id: string;
  /** pm_projects.id 또는 pm_tasks.id */
  targetId: string;
  /** yyyy-mm-dd */
  logDate: string;
  body: string;
  authorKey: string;
  createdAt: string;
}

/** Sprint 태스크 댓글 (flat thread). */
export interface PmComment {
  id: string;
  taskId: string;
  authorKey: string;
  body: string;
  createdAt: string;
}

