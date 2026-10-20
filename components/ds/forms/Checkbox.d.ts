import React from 'react';

/**
 * Checkbox with checked / unchecked / indeterminate states. Works controlled
 * (`checked`) or uncontrolled (`defaultChecked`). Optional inline label as children.
 */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean;
  children?: React.ReactNode;
}
export function Checkbox(props: CheckboxProps): JSX.Element;
