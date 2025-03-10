import React from "react";
import { AutoFormFieldProps } from "@autoform/react";
import { Label } from "../../label";
import { ColorInput } from "@ui/components";

export const ColorField: React.FC<AutoFormFieldProps> = ({
    field,
    label,
    id,
    inputProps,
}) => (
    <div className="flex items-center space-x-2">
        <ColorInput
            id={id}
            onChange={(checked) => {
                // react-hook-form expects an event object
                const event = {
                    target: {
                        name: field.key,
                        value: checked,
                    },
                };
                inputProps.onChange(event);
            }}
            defaultValue={inputProps.value}
        />
    </div>
);
