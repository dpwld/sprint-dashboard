import React from 'react';

/**
 * Transient notification card (presentational — bring your own queue and
 * positioning). Tone sets the accent + default icon; optional title, body
 * (children), and dismiss.
 */
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: (() => void) | null;
  children?: React.ReactNode;
}
export function Toast(props: ToastProps): JSX.Element;
