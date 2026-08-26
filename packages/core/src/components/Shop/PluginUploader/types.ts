import type { JSONContent } from "@kn/editor";
import type { ReactNode } from "react";

export type PluginCategoryValue = "APP" | "FEATURE" | "CONNECTOR";

export interface PluginTagValue {
  id: string;
  text: string;
}

export interface PluginDescriptionValue {
  id: string;
  label: string;
  content: JSONContent;
  canonical?: boolean;
}

export interface PluginSubmissionValues {
  name: string;
  pluginKey: string;
  version: string;
  category: PluginCategoryValue;
  tags: PluginTagValue[];
  icon: string;
  description: string;
  resourcePath: string;
  integrity: string;
  versionDescs: PluginDescriptionValue[];
}

export interface PluginSubmissionRecord extends Partial<PluginSubmissionValues> {
  id: string | number;
  status?: "PENDING" | "IN_PROGRESS" | "REJECTED" | "DONE";
}

export interface PluginUploaderProps {
  children: ReactNode;
  submission?: PluginSubmissionRecord;
  onSubmitted?: () => void;
}
