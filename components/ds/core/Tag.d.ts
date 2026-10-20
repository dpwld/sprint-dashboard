import React from 'react';

/**
 * Tag / chip for removable filter pills and inline metadata. Optional leading
 * color dot, active state, and a remove affordance. Becomes clickable when
 * `onClick` is provided (e.g. toggleable filter).
 */
export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md';
  /** Highlighted / selected state. */
  active?: boolean;
  /** CSS color for an optional leading dot. */
  dotColor?: string | null;
  /** When set, renders an × that calls this on click. */
  onRemove?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}
export function Tag(props: TagProps): JSX.Element;
