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

export const PLUGIN_PERMISSIONS = [
  "NETWORK",
  "STORAGE",
  "CLIPBOARD",
  "DOM",
  "EXTERNAL_RESOURCES",
  "EDITOR_EXTENSION",
  "BACKGROUND_TASKS",
  "DESKTOP",
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

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
  permissions: string[];
  versionDescs: PluginDescriptionValue[];
}

export interface PluginSubmissionRecord extends Partial<PluginSubmissionValues> {
  id: string | number;
  status?: "PENDING" | "IN_PROGRESS" | "REJECTED" | "DONE";
  /** Reviewer comment; when status is REJECTED this is the mandatory rejection reason. */
  reviewComment?: string;
  /** Structured rejection category, e.g. INTEGRITY_MISMATCH. */
  reviewReasonCode?: string;
  reviewerName?: string;
  reviewTime?: string;
}

export interface PluginUploaderProps {
  /** Trigger content; omit when the dialog is controlled via `open`. */
  children?: ReactNode;
  submission?: PluginSubmissionRecord;
  onSubmitted?: () => void;
  /** Controlled open state. Omit to use the built-in trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Prefill the wizard (e.g. from a dev project manifest). */
  initialValues?: Partial<PluginSubmissionValues>;
  /** An artifact the caller already uploaded (dev build). */
  initialArtifact?: { resourcePath: string; integrity?: string };
}
