import { buildZodFieldConfig } from "@autoform/react";
import { FieldTypes } from "./AutoForm";
import { SuperRefineFunction } from "@autoform/zod";


export const fieldConfig: any = buildZodFieldConfig<
    FieldTypes
>();

