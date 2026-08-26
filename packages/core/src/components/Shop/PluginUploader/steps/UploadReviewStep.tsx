import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FileUploader,
  Progress,
  type UseFormReturn,
} from "@kn/ui";
import {
  CheckCircle2,
  FileCode2,
  Loader2Icon,
  ShieldCheck,
  UploadIcon,
} from "@kn/icon";
import React, { type RefObject } from "react";

import type { PluginSubmissionValues } from "../types";

interface UploadReviewStepProps {
  form: UseFormReturn<PluginSubmissionValues>;
  attachments: File[];
  onFilesChange: (files: File[]) => void;
  onUpload: (files: File[]) => Promise<void>;
  isUploading: boolean;
  uploadError?: string;
  focusRef: RefObject<HTMLDivElement>;
  resolvePath: (path: string) => string;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export const UploadReviewStep = ({
  form,
  attachments,
  onFilesChange,
  onUpload,
  isUploading,
  uploadError,
  focusRef,
  resolvePath,
  t,
}: UploadReviewStepProps) => {
  const values = form.watch();
  const uploaded = Boolean(values.resourcePath && values.integrity);

  return (
    <div ref={focusRef} tabIndex={-1} className="space-y-4 outline-none">
      {(uploadError || form.formState.errors.resourcePath?.message) && (
        <Alert variant="destructive">
          <AlertTitle>{t("pluginUploader.validation.uploadTitle")}</AlertTitle>
          <AlertDescription>
            {uploadError || form.formState.errors.resourcePath?.message}
          </AlertDescription>
        </Alert>
      )}

      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2">
            <UploadIcon className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">
              {t("pluginUploader.uploadSection.title")}
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">
            {t("pluginUploader.uploadSection.hint")}
          </span>
        </div>
        <div className="p-4 sm:p-5">
          <FileUploader
            value={attachments}
            className="h-40 sm:h-44"
            accept={{
              "text/javascript": [".js"],
              "application/javascript": [".js"],
            }}
            maxSize={1024 * 1024 * 100}
            maxFileCount={1}
            onValueChange={onFilesChange}
            onUpload={onUpload}
            onUploadError={() => undefined}
            showUploadToast={false}
            disabled={isUploading}
            messages={{
              maxSingleFile: t("pluginUploader.uploadSection.singleFile"),
              maxFiles: () => t("pluginUploader.uploadSection.singleFile"),
              rejected: (name, message) =>
                t("pluginUploader.uploadSection.rejected", {
                  name,
                  message: message ?? "",
                }),
              dropActive: t("pluginUploader.uploadSection.dropActive"),
              dropIdle: t("pluginUploader.uploadSection.dropIdle"),
              uploadHint: () => t("pluginUploader.uploadSection.fileLimit"),
              removeFile: t("pluginUploader.buttons.removeFile"),
            }}
          />

          {isUploading && (
            <div className="mt-4 rounded-lg bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {t("pluginUploader.uploadSection.uploading")}
              </div>
              <Progress value={undefined} className="h-1.5" />
            </div>
          )}

          {uploaded && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-green-700 dark:text-green-400">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t("pluginUploader.uploadSection.uploaded")}
                </p>
                <p className="truncate text-xs opacity-80">
                  {values.resourcePath}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {t("pluginUploader.preview.title")}
            </CardTitle>
            <Badge variant="secondary">
              {t("pluginUploader.preview.submitForReview")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
              {values.icon ? (
                <img
                  src={resolvePath(values.icon)}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <FileCode2 className="size-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">
                  {values.name || t("pluginUploader.preview.noName")}
                </p>
                <Badge variant="outline" className="font-mono">
                  v{values.version}
                </Badge>
                <Badge variant="outline">
                  {t(
                    `pluginUploader.categories.${values.category.toLowerCase()}`,
                  )}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {values.description ||
                  t("pluginUploader.preview.noDescription")}
              </p>
            </div>
          </div>

          <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("pluginUploader.preview.pluginKey")}
              </dt>
              <dd className="mt-1 break-all font-mono">
                {values.pluginKey || "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("pluginUploader.preview.fileStatus")}
              </dt>
              <dd className="mt-1 flex items-center gap-1.5">
                {uploaded ? (
                  <ShieldCheck className="size-4 text-green-600" />
                ) : (
                  <UploadIcon className="size-4 text-orange-500" />
                )}
                {uploaded
                  ? t("pluginUploader.preview.integrityReady")
                  : t("pluginUploader.preview.pending")}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">
                {t("pluginUploader.preview.tags")}
              </dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {values.tags.length ? (
                  values.tags.map((tag) => (
                    <Badge key={tag.id} variant="secondary">
                      {tag.text}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground">
                    {t("pluginUploader.preview.noTags")}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Alert>
        <ShieldCheck className="size-4" />
        <AlertTitle>{t("pluginUploader.submitTip.title")}</AlertTitle>
        <AlertDescription>
          {t("pluginUploader.submitTip.reviewContent")}
        </AlertDescription>
      </Alert>
    </div>
  );
};
