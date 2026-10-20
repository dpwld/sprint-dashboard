import React from 'react';

/** Determinate progress / utilization bar. Optional label + percentage; tone for status. */
export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: React.ReactNode;
  showValue?: boolean;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}
export function ProgressBar(props: ProgressBarProps): JSX.Element;
