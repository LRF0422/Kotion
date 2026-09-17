import { ExtensionWrapper } from "@kn/common";
import { Checkbox } from "./checkbox";

export { Checkbox } from "./checkbox";
export { CheckboxView } from "./checkbox-view";

export const CheckboxExtension: ExtensionWrapper = {
    name: Checkbox.name,
    extendsion: [Checkbox],
};
