import React from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline';

/**
 * User / team avatar. Renders an image when `src` is given, otherwise initials
 * derived from `name`. Optional presence status dot.
 */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — used for initials fallback and tooltip. */
  name?: string;
  /** Image URL. Falls back to initials when absent. */
  src?: string | null;
  /** Size. @default 'md' */
  size?: AvatarSize;
  /** Rounded-square instead of circle. */
  square?: boolean;
  /** Presence indicator. */
  status?: AvatarStatus | null;
}

export function Avatar(props: AvatarProps): JSX.Element;
