import type { PluginApiIncompatibility } from "@kn/common";
import type { JSONContent } from "@kn/editor";

export type SerializedEnum<T extends string = string> =
  | T
  | { value?: T; desc?: string }
  | null;

export interface PluginVersionRecord {
  id?: string | number;
  subjectId?: string | number;
  name?: string;
  description?: string;
  developer?: string;
  icon?: string;
  pluginKey?: string;
  gitPath?: string;
  maintainer?: string;
  category?: SerializedEnum;
  installStatus?: SerializedEnum;
  currentVersionId?: string | number;
  activeVersionId?: string | number;
  resourcePath?: string;
  integrity?: string;
  version?: string;
  versionDescription?: PluginVersionDescription[];
}

export interface PluginVersionDescription {
  label?: string;
  content?: JSONContent | string | null;
}

export interface PluginRecord {
  id?: string | number;
  name?: string;
  description?: string;
  developer?: string;
  icon?: string;
  pluginKey?: string;
  gitPath?: string;
  maintainer?: string;
  category?: SerializedEnum;
  currentVersionId?: string | number;
  currentVersion?: PluginVersionRecord;
  installeddVersions?: PluginVersionRecord[];
  installStatus?: SerializedEnum;
  resourcePath?: string;
  integrity?: string;
  tags?: string[];
  rating?: number | string;
  reviews?: number | string;
  downloads?: number | string;
  createTime?: string;
  updateTime?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type PluginInstallState =
  | "not-installed"
  | "installed"
  | "active"
  | "disabled"
  | "incompatible";

export interface NormalizedPluginInstallState {
  state: PluginInstallState;
  installed: boolean;
  active: boolean;
  disabled: boolean;
  incompatible: boolean;
  incompatibility?: PluginApiIncompatibility;
}

export interface NormalizedDocumentationSection {
  id: string;
  label: string;
  content?: JSONContent;
  malformed: boolean;
}

export const enumValue = <T extends string = string>(
  value?: SerializedEnum<T>,
): T | undefined => {
  if (typeof value === "string") return value as T;
  return value?.value;
};

export const toFiniteNumber = (value?: number | string | null): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getPluginVersionId = (
  plugin: PluginRecord,
): string | number | undefined =>
  plugin.currentVersionId ?? plugin.currentVersion?.id;

const sameIdentityValue = (
  left?: string | number,
  right?: string | number,
): boolean =>
  left !== undefined && right !== undefined && String(left) === String(right);

export const findPluginIncompatibility = (
  plugin: PluginRecord,
  incompatiblePlugins?: readonly PluginApiIncompatibility[],
): PluginApiIncompatibility | undefined => {
  if (!incompatiblePlugins?.length) return undefined;

  const candidates = plugin.installeddVersions?.length
    ? plugin.installeddVersions
    : plugin.currentVersion
      ? [plugin.currentVersion]
      : [plugin as PluginVersionRecord];

  return incompatiblePlugins.find((issue) =>
    candidates.some((candidate) => {
      const candidateKey = candidate.pluginKey ?? plugin.pluginKey;
      const candidateName = candidate.name ?? plugin.name;

      if (issue.pluginKey && candidateKey) {
        if (issue.pluginKey !== candidateKey) return false;
      } else if (!issue.name || issue.name !== candidateName) {
        return false;
      }

      const issueHasVersion =
        issue.versionId !== undefined || issue.version !== undefined;
      const candidateHasVersion =
        candidate.id !== undefined || candidate.version !== undefined;
      if (!issueHasVersion || !candidateHasVersion) return true;

      return (
        sameIdentityValue(issue.versionId, candidate.id) ||
        sameIdentityValue(issue.version, candidate.version)
      );
    }),
  );
};

export const getPluginInstallState = (
  plugin: PluginRecord,
  loadedPluginNames?: ReadonlySet<string>,
  incompatiblePlugins?: readonly PluginApiIncompatibility[],
): NormalizedPluginInstallState => {
  const status = enumValue(plugin.installStatus)?.toUpperCase();
  const installed =
    Boolean(status) || Boolean(plugin.installeddVersions?.length);
  const disabled = status === "DISABLED";
  const incompatibility = installed
    ? findPluginIncompatibility(plugin, incompatiblePlugins)
    : undefined;
  const incompatible = Boolean(incompatibility);
  const active =
    installed &&
    !disabled &&
    !incompatible &&
    Boolean(plugin.name && loadedPluginNames?.has(plugin.name));

  return {
    state: disabled
      ? "disabled"
      : incompatible
        ? "incompatible"
        : active
          ? "active"
          : installed
            ? "installed"
            : "not-installed",
    installed,
    active,
    disabled,
    incompatible,
    incompatibility,
  };
};

export const buildPluginRuntimePayload = (plugin: PluginRecord) => {
  const versionId = getPluginVersionId(plugin);
  const resourcePath =
    plugin.resourcePath ?? plugin.currentVersion?.resourcePath;
  const integrity = plugin.integrity ?? plugin.currentVersion?.integrity;

  if (!versionId || !resourcePath || !plugin.name) return null;

  return {
    ...plugin,
    id: versionId,
    version: plugin.currentVersion?.version,
    resourcePath,
    integrity,
  };
};

const sectionId = (label: string, index: number) => {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "section"}-${index}`;
};

const normalizeJsonContent = (
  content?: JSONContent | string | null,
): JSONContent | undefined => {
  try {
    const value = typeof content === "string" ? JSON.parse(content) : content;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return undefined;
    if (typeof value.type !== "string" && !Array.isArray(value.content))
      return undefined;
    return value;
  } catch {
    return undefined;
  }
};

export const normalizeDocumentationSections = (
  descriptions?: PluginVersionDescription[],
): NormalizedDocumentationSection[] =>
  (descriptions ?? []).flatMap<NormalizedDocumentationSection>(
    (description, index) => {
      const label = description.label?.trim();
      if (!label) return [];

      const content = normalizeJsonContent(description.content);
      return [
        {
          id: sectionId(label, index),
          label,
          content,
          malformed: !content,
        },
      ];
    },
  );

export const isHttpUrl = (value?: string): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
