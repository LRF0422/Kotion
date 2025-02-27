import React, { ReactNode, useCallback } from "react";
import { Select as ReactSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui";
import { Editor } from "@tiptap/core";

interface SelectProps {
  editor: Editor;
  value: any,
  options: any[],
  onChange: (value: any) => void,
  disabled: boolean
  className?: string
}

export function Select(props: React.PropsWithChildren<SelectProps>) {
  const { editor, value, options, onChange, disabled, ...rest } = props;

  return (
    <ReactSelect
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      // onChange={onChange}
      // options={options}
      {...rest}>
      <SelectTrigger className={props.className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {
          options && options.map((it, index) => (
            <SelectItem key={index} value={it.value}>{it.label}</SelectItem>
          ))
        }
      </SelectContent>
    </ReactSelect>
  );
}
