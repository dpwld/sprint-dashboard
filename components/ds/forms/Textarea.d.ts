import React from 'react';

/** Multi-line text input. `error` state; vertically resizable. Wrap with FormField for labels. */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}
export function Textarea(props: TextareaProps): JSX.Element;
