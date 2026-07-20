/**
 * @deprecated This legacy ColorPicker is no longer used.
 * Use the unified ColorPicker from @kn/ui instead:
 *   import { ColorPicker } from "@kn/ui"
 */
import React from "react";
import { ColorPicker as UnifiedColorPicker } from "@kn/ui";

/** @deprecated Use ColorPicker from @kn/ui instead */
export const ColorPicker: React.FC<{
  title?: string;
  onSetColor: (arg: string | null) => void;
  disabled?: boolean;
  children?: any;
}> = ({ onSetColor, disabled = false }) => {
  return (
    <UnifiedColorPicker
      value="#000000"
      onChange={(color) => onSetColor(color)}
      onUnset={() => onSetColor(null)}
      trigger="toggle"
      disabled={disabled}
    />
  );
};
