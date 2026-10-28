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
    <section className="border-b border-border/60 pb-5 sm:pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <PluginIcon
          src={iconUrl}
          name={plugin.name}
          loading="eager"
          className="size-14 shrink-0 rounded-lg sm:size-16"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 break-words text-lg font-semibold tracking-tight sm:text-xl">
                  {plugin.name}
                </h1>
                {enumValue(plugin.category) && (
                  <Badge
                    variant="outline"
                    className="h-5 rounded-sm px-1.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground"
                  >
                    {enumValue(plugin.category)}
                  </Badge>
                )}
                {plugin.currentVersion?.version && (
                  <span className="font-mono text-xs text-muted-foreground">
                    v{plugin.currentVersion.version}
                  </span>
                )}
              </div>

              {plugin.developer && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("pluginHub.detail.by", { name: plugin.developer })}
                </p>
              )}
            </div>

            <div className="w-full shrink-0 sm:w-44">
              {!installState.installed ? (
                <div className="space-y-1.5">
                  <Button
                    className="h-10 w-full gap-2 px-4"
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
                    <p className="text-xs leading-5 text-destructive">
                      {t("pluginHub.detail.packageUnavailable")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="sm:text-right">
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 text-sm font-medium",
                      statusKey === "active" &&
                        "text-green-600 dark:text-green-400",
                      statusKey === "disabled" &&
                        "text-orange-600 dark:text-orange-400",
                      statusKey === "incompatible" &&
                        "text-amber-600 dark:text-amber-400",
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
                    <p className="mt-1 text-left text-xs leading-5 text-muted-foreground sm:text-right">
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

          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {plugin.description || t("pluginHub.detail.unavailable")}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <DownloadIcon className="size-3.5" />
              {numberFormatter.format(toFiniteNumber(plugin.downloads))}
              <span>{t("pluginHub.detail.downloads")}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Star className="size-3.5 fill-yellow-500 text-yellow-500" />
              {rating.toFixed(1)}
            </span>
            <span className="tabular-nums">
              {numberFormatter.format(toFiniteNumber(plugin.reviews))}{" "}
              {t("pluginHub.detail.reviews")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
