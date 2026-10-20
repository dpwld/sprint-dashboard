import React from 'react';

/**
 * Field wrapper: label (with required/optional affordances), the control as
 * children, and a hint OR error message below. Pairs with Input, Select,
 * Textarea, etc.
 */
export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  /** Helper text shown when there is no error. */
  hint?: React.ReactNode;
  /** Error message; replaces hint and styles the message red. */
  error?: React.ReactNode;
  /** Links the label to the control id. */
  htmlFor?: string | null;
  children?: React.ReactNode;
}
export function FormField(props: FormFieldProps): JSX.Element;
