import { APIS, useApi, useTranslation } from "@kn/common";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@kn/ui";
import { FlagIcon } from "@kn/icon";
import React from "react";

const REPORT_REASONS = [
  "MALICIOUS",
  "PRIVACY",
  "COPYRIGHT",
  "SPAM",
  "OTHER",
] as const;

interface PluginReportDialogProps {
  pluginId: string | number;
  pluginName?: string;
  versionId?: string | number;
}

export const PluginReportDialog: React.FC<PluginReportDialogProps> = ({
  pluginId,
  pluginName,
  versionId,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<string>("");
  const [detail, setDetail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await useApi(APIS.SUBMIT_PLUGIN_REPORT, null, {
        pluginId,
        versionId: versionId ?? null,
        reasonType: reason,
        reasonText: detail.trim() || null,
      });
      toast.success(t("pluginHub.report.success"));
      setOpen(false);
      setReason("");
      setDetail("");
    } catch {
      toast.error(t("pluginHub.report.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2 text-muted-foreground"
        >
          <FlagIcon className="size-4" />
          {t("pluginHub.report.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("pluginHub.report.title")}</DialogTitle>
          <DialogDescription>
            {t("pluginHub.report.description", { name: pluginName ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">
              {t("pluginHub.report.reasonLabel")}
            </span>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={t("pluginHub.report.reasonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {REPORT_REASONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`pluginHub.report.reasons.${value.toLowerCase()}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">
              {t("pluginHub.report.detailLabel")}
            </span>
            <Textarea
              value={detail}
              maxLength={500}
              rows={4}
              placeholder={t("pluginHub.report.detailPlaceholder")}
              onChange={(event) => setDetail(event.target.value)}
            />
            <div className="text-right text-xs text-muted-foreground">
              {detail.length}/500
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" disabled={submitting} onClick={() => setOpen(false)}>
            {t("pluginHub.report.cancel")}
          </Button>
          <Button className="h-11" disabled={!reason || submitting} onClick={() => void submit()}>
            {submitting ? t("pluginHub.report.submitting") : t("pluginHub.report.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
