import { useTranslation } from "@kn/common";
import {
  AlertTriangle,
  CheckCircle2,
  DownloadIcon,
  Loader2,
  PowerIcon,
  Star,
} from "@kn/icon";
import { Badge, Button, cn } from "@kn/ui";
import React, { useMemo } from "react";
import { PluginIcon } from "../PluginIcon";
import {
  enumValue,
  NormalizedPluginInstallState,
  PluginRecord,
  toFiniteNumber,
} from "../plugin-model";

interface PluginDetailHeroProps {
  plugin: PluginRecord;
  iconUrl?: string;
  installState: NormalizedPluginInstallState;
  installing: boolean;
  packageAvailable: boolean;
  onInstall: () => void;
}

export const PluginDetailHero: React.FC<PluginDetailHeroProps> = ({
  plugin,
  iconUrl,
  installState,
  installing,
  packageAvailable,
  onInstall,
}) => {
  const { t, i18n } = useTranslation();
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const rating = toFiniteNumber(plugin.rating);
  const statusKey = installState.disabled
    ? "disabled"
    : installState.incompatible
      ? "incompatible"
      : installState.active
        ? "active"
        : "installed";
  const incompatibility = installState.incompatibility;

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="border-b border-border/60 bg-primary/[0.025] p-5 md:p-6 lg:p-7">
        <div className="grid gap-5 md:grid-cols-[96px_minmax(0,1fr)] md:items-start xl:grid-cols-[112px_minmax(0,1fr)_auto] xl:gap-7">
          <PluginIcon
            src={iconUrl}
            name={plugin.name}
            loading="eager"
            className="size-20 rounded-2xl bg-background shadow-sm md:size-24 xl:size-28"
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight md:text-3xl">
                {plugin.name}
              </h1>
              {enumValue(plugin.category) && (
                <Badge variant="secondary" className="font-normal">
                  {enumValue(plugin.category)}
                </Badge>
              )}
              {plugin.currentVersion?.version && (
                <Badge variant="outline" className="font-mono font-normal">
                  v{plugin.currentVersion.version}
                </Badge>
              )}
            </div>

            {plugin.developer && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t("pluginHub.detail.by", { name: plugin.developer })}
              </p>
            )}

            <p className="mt-4 max-w-3xl text-sm leading-6 text-foreground/85 md:text-base md:leading-7">
              {plugin.description || t("pluginHub.detail.unavailable")}
            </p>

            <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted/70 px-3 tabular-nums">
                <DownloadIcon className="size-3.5" />
                {numberFormatter.format(toFiniteNumber(plugin.downloads))}
                <span>{t("pluginHub.detail.downloads")}</span>
              </span>
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted/70 px-3 tabular-nums">
                <Star className="size-3.5 fill-yellow-500 text-yellow-500" />
                {rating.toFixed(1)}
              </span>
              <span className="inline-flex h-8 items-center rounded-full bg-muted/70 px-3 tabular-nums">
                {numberFormatter.format(toFiniteNumber(plugin.reviews))}
                <span className="ml-1">{t("pluginHub.detail.reviews")}</span>
              </span>
            </div>
          </div>

          <div className="md:col-start-2 xl:col-start-auto xl:min-w-48 xl:justify-self-end">
            {!installState.installed ? (
              <div className="space-y-2">
                <Button
                  size="lg"
                  className="h-11 w-full min-w-44 gap-2 px-5 md:w-auto"
                  disabled={installing || !packageAvailable}
                  onClick={onInstall}
                >
                  {installing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <DownloadIcon className="size-4" />
                  )}
                  {installing
                    ? t("pluginHub.detail.installing")
                    : t("pluginHub.detail.install")}
                </Button>
                {!packageAvailable && (
                  <p className="max-w-56 text-xs leading-5 text-destructive">
                    {t("pluginHub.detail.packageUnavailable")}
                  </p>
                )}
              </div>
            ) : (
              <div
                className={cn(
                  "rounded-xl border px-4 py-3 xl:min-w-48",
                  statusKey === "active" &&
                    "border-green-500/25 bg-green-500/5",
                  statusKey === "disabled" &&
                    "border-orange-500/25 bg-orange-500/5",
                  statusKey === "incompatible" &&
                    "border-amber-500/30 bg-amber-500/[0.07]",
                  statusKey === "installed" &&
                    "border-border/70 bg-background/70",
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-2 text-sm font-semibold",
                    statusKey === "active" &&
                      "text-green-700 dark:text-green-400",
                    statusKey === "disabled" &&
                      "text-orange-700 dark:text-orange-400",
                    statusKey === "incompatible" &&
                      "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {statusKey === "disabled" ? (
                    <PowerIcon className="size-4" />
                  ) : statusKey === "incompatible" ? (
                    <AlertTriangle className="size-4" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {t(`pluginHub.detail.${statusKey}`)}
                </div>
                {statusKey !== "active" && (
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {statusKey === "incompatible"
                      ? incompatibility?.apiVersion &&
                        incompatibility.hostApiVersion
                        ? t("pluginHub.detail.incompatibleHintVersions", {
                            pluginApiVersion: incompatibility.apiVersion,
                            hostApiVersion: incompatibility.hostApiVersion,
                          })
                        : t("pluginHub.detail.incompatibleHint")
                      : t(
                          statusKey === "disabled"
                            ? "pluginHub.detail.disabledHint"
                            : "pluginHub.detail.installedHint",
                        )}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
