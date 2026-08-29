import { useTranslation } from "@kn/common";
import { DownloadIcon, ExternalLink, Star } from "@kn/icon";
import { Badge, Card } from "@kn/ui";
import React, { ReactNode, useMemo } from "react";
import {
  enumValue,
  isHttpUrl,
  PluginRecord,
  toFiniteNumber,
} from "../plugin-model";

interface PluginFactsPanelProps {
  plugin: PluginRecord;
}

const FactRow: React.FC<{
  label: string;
  children: ReactNode;
  mono?: boolean;
}> = ({ label, children, mono }) => (
  <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-start gap-3 py-2.5 text-sm">
    <dt className="text-muted-foreground">{label}</dt>
    <dd
      className={
        mono
          ? "break-all text-right font-mono text-xs"
          : "break-words text-right font-medium"
      }
    >
      {children}
    </dd>
  </div>
);

const FactsCard: React.FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <Card className="overflow-hidden border-border/70 shadow-none">
    <div className="border-b border-border/60 px-4 py-3.5">
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
    <div className="divide-y divide-border/50 px-4">{children}</div>
  </Card>
);

export const PluginFactsPanel: React.FC<PluginFactsPanelProps> = ({
  plugin,
}) => {
  const { t, i18n } = useTranslation();
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const unavailable = t("pluginHub.detail.unavailable");
  const category = enumValue(plugin.category);
  const repositoryAvailable = isHttpUrl(plugin.gitPath);
  const tags = plugin.tags?.filter(Boolean) ?? [];

  return (
    <aside className="space-y-4 self-start xl:sticky xl:top-6">
      <FactsCard title={t("pluginHub.detail.about")}>
        <dl>
          <FactRow label={t("pluginHub.detail.version")} mono>
            {plugin.currentVersion?.version ?? unavailable}
          </FactRow>
          <FactRow label={t("pluginHub.detail.category")}>
            {category ? (
              <Badge variant="secondary">{category}</Badge>
            ) : (
              unavailable
            )}
          </FactRow>
          <FactRow label={t("pluginHub.detail.developer")}>
            {plugin.developer ?? unavailable}
          </FactRow>
          <FactRow label={t("pluginHub.detail.maintainer")}>
            {plugin.maintainer ?? unavailable}
          </FactRow>
          {plugin.pluginKey && (
            <FactRow label={t("pluginHub.detail.pluginKey")} mono>
              {plugin.pluginKey}
            </FactRow>
          )}
        </dl>
      </FactsCard>

      <FactsCard title={t("pluginHub.detail.statistics")}>
        <dl>
          <FactRow label={t("pluginHub.detail.downloads")}>
            <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
              <DownloadIcon className="size-3.5 text-muted-foreground" />
              {numberFormatter.format(toFiniteNumber(plugin.downloads))}
            </span>
          </FactRow>
          <FactRow label={t("pluginHub.detail.rating")}>
            <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
              <Star className="size-3.5 fill-yellow-500 text-yellow-500" />
              {toFiniteNumber(plugin.rating).toFixed(1)}
            </span>
          </FactRow>
          <FactRow label={t("pluginHub.detail.reviews")}>
            <span className="tabular-nums">
              {numberFormatter.format(toFiniteNumber(plugin.reviews))}
            </span>
          </FactRow>
        </dl>
      </FactsCard>

      {tags.length > 0 && (
        <Card className="border-border/70 p-4 shadow-none">
          <h2 className="text-sm font-semibold">
            {t("pluginHub.detail.tags")}
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {repositoryAvailable && (
        <Card className="border-border/70 p-4 shadow-none">
          <h2 className="text-sm font-semibold">
            {t("pluginHub.detail.resources")}
          </h2>
          <a
            href={plugin.gitPath}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border/60 px-3 text-sm font-medium transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>{t("pluginHub.detail.repository")}</span>
            <ExternalLink className="size-4 text-muted-foreground" />
          </a>
        </Card>
      )}
    </aside>
  );
};
