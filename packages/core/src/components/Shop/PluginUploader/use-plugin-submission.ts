import { APIS, useApi, useUploadFile } from "@kn/common";
import { toast, type UseFormReturn } from "@kn/ui";
import React from "react";

import {
  createDefaultPluginSubmission,
  normalizeSubmissionPayload,
} from "./schema";
import type { PluginSubmissionRecord, PluginSubmissionValues } from "./types";

interface UsePluginSubmissionOptions {
  form: UseFormReturn<PluginSubmissionValues>;
  submission?: PluginSubmissionRecord;
  onSubmitted?: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const pickImageFile = () =>
  new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });

const validateIcon = async (file: File) => {
  if (!["image/png", "image/jpeg"].includes(file.type))
    throw new Error("iconType");
  if (file.size > 2 * 1024 * 1024) throw new Error("iconSize");

  const url = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = reject;
        image.src = url;
      },
    );
    if (dimensions.width !== dimensions.height) throw new Error("iconSquare");
    if (dimensions.width < 120 || dimensions.height < 120)
      throw new Error("iconDimensions");
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const usePluginSubmission = ({
  form,
  submission,
  onSubmitted,
  t,
}: UsePluginSubmissionOptions) => {
  const { uploadFile, uploadPluginFile, usePath } = useUploadFile();
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const [iconUploading, setIconUploading] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string>();
  const [submitError, setSubmitError] = React.useState<string>();
  const sessionRef = React.useRef(0);
  const artifactGenerationRef = React.useRef(0);
  const iconGenerationRef = React.useRef(0);
  const submitLockRef = React.useRef(false);

  const nextSession = React.useCallback(() => {
    sessionRef.current += 1;
    return sessionRef.current;
  }, []);

  const reset = React.useCallback(() => {
    nextSession();
    artifactGenerationRef.current += 1;
    iconGenerationRef.current += 1;
    const defaults = createDefaultPluginSubmission();
    const rawTags = (submission?.tags ?? []) as Array<string | { id?: string; text?: string }>;
    const rawDescriptions = (submission?.versionDescs ?? defaults.versionDescs) as any[];
    form.reset({
      ...defaults,
      ...submission,
      category: ((submission as any)?.category?.value ?? submission?.category ?? defaults.category) as PluginSubmissionValues["category"],
      icon: submission?.icon ?? "",
      resourcePath: submission?.resourcePath ?? "",
      integrity: submission?.integrity ?? "",
      tags: rawTags.map((tag, index) =>
        typeof tag === "string"
          ? { id: `tag-${index}`, text: tag }
          : { id: tag.id ?? `tag-${index}`, text: tag.text ?? "" },
      ),
      versionDescs: rawDescriptions.map((item, index) => {
        const label = item.label ?? `Section ${index + 1}`;
        const canonicalId = ({ feature: "feature", detail: "detail", changelog: "changelog" } as Record<string, string>)[label.toLowerCase()];
        return {
          id: canonicalId ?? item.id ?? `description-${index}`,
          label,
          canonical: Boolean(canonicalId),
          content:
            typeof item.content === "string"
              ? (() => {
                  try {
                    return JSON.parse(item.content);
                  } catch {
                    return {};
                  }
                })()
              : item.content ?? {},
        };
      }),
    });
    setAttachments([]);
    setIsUploading(false);
    setIconUploading(false);
    setIsSubmitting(false);
    setUploadError(undefined);
    setSubmitError(undefined);
  }, [form, nextSession, submission]);

  const setArtifactFiles = React.useCallback(
    (files: File[]) => {
      artifactGenerationRef.current += 1;
      setIsUploading(false);
      setAttachments(files);
      form.setValue("resourcePath", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("integrity", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
      setUploadError(undefined);
    },
    [form],
  );

  const uploadArtifact = React.useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const session = sessionRef.current;
      const generation = ++artifactGenerationRef.current;
      setIsUploading(true);
      setUploadError(undefined);
      form.setValue("resourcePath", "", { shouldDirty: true });
      form.setValue("integrity", "", { shouldDirty: true });

      try {
        const result = await uploadPluginFile(file);
        if (session !== sessionRef.current || generation !== artifactGenerationRef.current) return;
        form.setValue("resourcePath", result.name, {
          shouldDirty: true,
          shouldValidate: true,
        });
        form.setValue("integrity", result.integrity, {
          shouldDirty: true,
          shouldValidate: true,
        });
      } catch (error: any) {
        if (session !== sessionRef.current || generation !== artifactGenerationRef.current) return;
        const message =
          error?.message || t("pluginUploader.toast.fileUploadFailed");
        setUploadError(message);
        throw error;
      } finally {
        if (session === sessionRef.current && generation === artifactGenerationRef.current) setIsUploading(false);
      }
    },
    [form, t, uploadPluginFile],
  );

  const uploadIcon = React.useCallback(async () => {
    const file = await pickImageFile();
    if (!file) return;
    const session = sessionRef.current;
    const generation = ++iconGenerationRef.current;
    setIconUploading(true);
    try {
      await validateIcon(file);
      const result = await uploadFile(file);
      if (session !== sessionRef.current || generation !== iconGenerationRef.current) return;
      form.setValue("icon", result.name, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } catch (error: any) {
      if (session !== sessionRef.current || generation !== iconGenerationRef.current) return;
      const key = [
        "iconType",
        "iconSize",
        "iconSquare",
        "iconDimensions",
      ].includes(error?.message)
        ? `pluginUploader.validation.${error.message}`
        : "pluginUploader.toast.iconUploadFailed";
      toast.error(t(key));
    } finally {
      if (session === sessionRef.current && generation === iconGenerationRef.current) setIconUploading(false);
    }
  }, [form, t, uploadFile]);

  const removeIcon = React.useCallback(() => {
    iconGenerationRef.current += 1;
    setIconUploading(false);
    form.setValue("icon", "", { shouldDirty: true, shouldValidate: true });
  }, [form]);

  const submit = React.useCallback(
    async (values: PluginSubmissionValues) => {
      if (isUploading || iconUploading || submitLockRef.current) return false;
      submitLockRef.current = true;
      const session = sessionRef.current;
      setSubmitError(undefined);
      setIsSubmitting(true);
      try {
        const payload = normalizeSubmissionPayload(values);
        if (submission?.id) {
          await useApi(APIS.RESUBMIT_PLUGIN, { id: submission.id }, payload);
        } else {
          await useApi(APIS.SUBMIT_PLUGIN, null, payload);
        }
        if (session !== sessionRef.current) return false;
        toast.success(t("pluginUploader.toast.submittedForReview"));
        onSubmitted?.();
        return true;
      } catch (error: any) {
        if (session === sessionRef.current) {
          setSubmitError(error?.message || t("pluginUploader.toast.submitFailed"));
        }
        return false;
      } finally {
        submitLockRef.current = false;
        if (session === sessionRef.current) setIsSubmitting(false);
      }
    },
    [iconUploading, isUploading, onSubmitted, submission?.id, t],
  );

  return {
    attachments,
    setArtifactFiles,
    uploadArtifact,
    uploadIcon,
    removeIcon,
    uploadError,
    submitError,
    isUploading,
    iconUploading,
    isSubmitting,
    reset,
    nextSession,
    submit,
    usePath,
  };
};
