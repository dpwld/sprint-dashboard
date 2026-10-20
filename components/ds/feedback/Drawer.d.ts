import React from 'react';

/**
 * Right (or left) slide-out side panel for record detail, comments, or
 * filters. Lighter than Modal: by default no dark scrim, so the underlying
 * table/list stays visible — the contextual-panel pattern. Closes on the
 * close button, Escape, and (when scrim is on) backdrop click.
 *
 * @startingPoint section="Feedback" subtitle="Slide-out detail / comment panel" viewport="700x600"
 */
export interface DrawerProps extends React.HTMLAttributes<HTMLElement> {
  open: boolean;
  onClose?: (() => void) | null;
  title?: React.ReactNode;
  /** Icon node shown before the title. */
  titleIcon?: React.ReactNode;
  side?: 'right' | 'left';
  /** Panel width in px (or any CSS width). @default 460 */
  width?: number | string;
  /** Show a dimming backdrop behind the panel. @default false */
  scrim?: boolean;
  /** Close when the user clicks/taps outside the panel (blur-saves run first). @default false */
  closeOnOutside?: boolean;
  /** Extra controls in the header, before the close button. */
  headerActions?: React.ReactNode;
  /** Sticky footer node (e.g. a comment composer). */
  footer?: React.ReactNode;
  bodyClassName?: string;
  children?: React.ReactNode;
}
export function Drawer(props: DrawerProps): JSX.Element | null;
