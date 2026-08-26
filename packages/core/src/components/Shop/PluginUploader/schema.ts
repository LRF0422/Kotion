import { z } from "@kn/ui";

import type { PluginSubmissionValues } from "./types";

export const PLUGIN_CATEGORIES = ["APP", "FEATURE", "CONNECTOR"] as const;

export const createPluginSubmissionSchema = (t: (key: string) => string) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(2, t("pluginUploader.validation.nameMin"))
      .max(50, t("pluginUploader.validation.nameMax")),
    pluginKey: z
      .string()
      .trim()
      .min(2, t("pluginUploader.validation.keyMin"))
      .max(50, t("pluginUploader.validation.keyMax"))
      .regex(/^[a-z0-9-]+$/, t("pluginUploader.validation.keyFormat")),
    version: z
      .string()
      .trim()
      .max(64, t("pluginUploader.validation.versionFormat"))
      .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, t("pluginUploader.validation.versionFormat")),
    category: z.enum(PLUGIN_CATEGORIES),
    tags: z
      .array(
        z.object({
          id: z.string(),
          text: z.string().trim().min(1).max(30),
        }),
      )
      .min(1, t("pluginUploader.validation.tagsMin"))
      .max(5, t("pluginUploader.validation.tagsMax")),
    icon: z.string(),
    description: z
      .string()
      .trim()
      .min(10, t("pluginUploader.validation.descriptionMin"))
      .max(500, t("pluginUploader.validation.descriptionMax")),
    resourcePath: z.string(),
    integrity: z.string(),
    versionDescs: z.array(
      z.object({
        id: z.string(),
        label: z.string().trim().min(1).max(40),
        content: z.any(),
        canonical: z.boolean().optional(),
      }),
    ).max(20),
  });

export const createDefaultPluginSubmission = (): PluginSubmissionValues => ({
  name: "",
  pluginKey: "",
  version: "1.0.0",
  category: "FEATURE",
  tags: [],
  icon: "",
  description: "",
  resourcePath: "",
  integrity: "",
  versionDescs: [
    { id: "feature", label: "Feature", content: {}, canonical: true },
    { id: "detail", label: "Detail", content: {}, canonical: true },
    { id: "changelog", label: "ChangeLog", content: {}, canonical: true },
  ],
});

export const normalizeSubmissionPayload = (values: PluginSubmissionValues) => ({
  name: values.name.trim(),
  pluginKey: values.pluginKey.trim(),
  version: values.version.trim(),
  category: values.category,
  tags: values.tags.map((tag) => tag.text.trim()).filter(Boolean),
  icon: values.icon || null,
  description: values.description.trim(),
  resourcePath: values.resourcePath,
  integrity: values.integrity,
  versionDescs: values.versionDescs
    .filter(
      (item) =>
        item.label.trim() &&
        item.content &&
        Object.keys(item.content).length > 0,
    )
    .map((item) => ({
      label: item.label.trim(),
      content:
        typeof item.content === "string"
          ? item.content
          : JSON.stringify(item.content),
    })),
});
