import { Input } from "@ui/components/ui/input";
import { AutoFormFieldProps } from "@autoform/react";
import React from "react";
import { DateTimePicker } from "../../datetime-picker";

export const DateField: React.FC<AutoFormFieldProps> = ({
  inputProps,
  error,
  field,
  id,
}) => {
  const { key, ...props } = inputProps;

  return (
    <DateTimePicker
      id={id}
      onChange={(date) => {
        const event = {
          target: {
            name: field.key,
            value: date,
          },
        };
        inputProps.onChange(event);
      }}
      className={error ? "border-destructive" : ""}
      {...props}
    />
  );
};
