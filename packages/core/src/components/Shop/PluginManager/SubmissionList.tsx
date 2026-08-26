import { Alert, AlertDescription, AlertTitle, Badge, Button, EmptyState, ScrollArea } from "@kn/ui";
import {
  CheckCircleIcon,
  ClockIcon,
  EditIcon,
  FileCode2,
  Loader2Icon,
  XCircleIcon,
} from "@kn/icon";
import { useTranslation } from "@kn/common";
import React from "react";

import { PluginUploader } from "../PluginUploader";
import type { PluginSubmissionRecord } from "../PluginUploader/types";

interface SubmissionListProps {
  data: PluginSubmissionRecord[];
  loading: boolean;
  error?: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRefresh: () => void;
}

const statusTone: Record<string, string> = {
  PENDING:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  IN_PROGRESS:
    "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  REJECTED: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  DONE: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
};

export const SubmissionList = ({
  data,
  loading,
  error,
  hasMore,
  onLoadMore,
  onRefresh,
}: SubmissionListProps) => {
  const { t } = useTranslation();

  if (loading && !data.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>{t("pluginManager.loadFailed")}</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>{error}</p>
            <Button type="button" variant="outline" className="h-11" onClick={onRefresh}>
              {t("pluginManager.refresh")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          title={t("pluginManager.submissions.emptyTitle")}
          description={t("pluginManager.submissions.emptyDescription")}
          icons={[FileCode2]}
        />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        {data.map((submission) => {
          const rawStatus = (submission as any).status;
          const status = (typeof rawStatus === "string" ? rawStatus : rawStatus?.value ?? rawStatus?.code ?? "PENDING") as string;
          return (
            <article
              key={submission.id}
              className="rounded-xl border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {status === "DONE" ? (
                    <CheckCircleIcon className="size-5 text-green-600" />
                  ) : status === "REJECTED" ? (
                    <XCircleIcon className="size-5 text-red-600" />
                  ) : (
                    <ClockIcon className="size-5 text-amber-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-medium">{submission.name}</h3>
                    <Badge variant="outline" className={statusTone[status]}>
                      {t(
                        `pluginManager.submissions.status.${status.toLowerCase()}`,
                      )}
                    </Badge>
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {submission.pluginKey}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {submission.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>v{submission.version || "1.0.0"}</span>
                {status === "REJECTED" ? (
                  <PluginUploader
                    submission={submission}
                    onSubmitted={onRefresh}
                  >
                    <Button size="sm" variant="outline" className="h-11">
                      <EditIcon className="mr-1.5 size-4" />
                      {t("pluginManager.submissions.editResubmit")}
                    </Button>
                  </PluginUploader>
                ) : (
                  <span>{t("pluginManager.submissions.readOnly")}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {hasMore && (
        <div className="flex justify-center px-4 pb-6">
          <Button type="button" variant="outline" className="h-11 min-w-32" onClick={onLoadMore} disabled={loading}>
            {loading && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {t("pluginManager.submissions.loadMore")}
          </Button>
        </div>
      )}
    </ScrollArea>
  );
};
