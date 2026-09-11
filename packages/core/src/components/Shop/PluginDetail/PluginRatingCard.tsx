import { APIS, useApi, useTranslation } from "@kn/common";
import { Star } from "@kn/icon";
import { Card, cn, toast } from "@kn/ui";
import React from "react";

import { toFiniteNumber, type PluginRecord } from "../plugin-model";

interface PluginRatingCardProps {
  plugin: PluginRecord;
  /** Called after a successful submit so the page can refresh aggregates. */
  onRated?: () => void;
}

const SCORES = [1, 2, 3, 4, 5];

export const PluginRatingCard: React.FC<PluginRatingCardProps> = ({
  plugin,
  onRated,
}) => {
  const { t } = useTranslation();
  const [hover, setHover] = React.useState(0);
  const [mine, setMine] = React.useState(toFiniteNumber(plugin.myRating));
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    setMine(toFiniteNumber(plugin.myRating));
  }, [plugin.myRating]);

  const rating = toFiniteNumber(plugin.rating);
  const reviews = toFiniteNumber(plugin.reviews);
  const active = hover || mine;

  const submit = async (score: number) => {
    if (submitting || !plugin.id) return;
    if (score === mine) return;
    setSubmitting(true);
    try {
      await useApi(APIS.SUBMIT_PLUGIN_RATING, { id: plugin.id }, { score });
      setMine(score);
      toast.success(t("pluginHub.rating.success"));
      onRated?.();
    } catch (error: any) {
      toast.error(error?.message || t("pluginHub.rating.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-border/70 p-4 shadow-none">
      <h2 className="text-sm font-semibold">{t("pluginHub.rating.title")}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-2xl font-bold tabular-nums">
          {rating.toFixed(1)}
        </span>
        <div
          className="flex items-center gap-0.5"
          role="radiogroup"
          aria-label={t("pluginHub.rating.title")}
        >
          {SCORES.map((score) => (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={mine === score}
              aria-label={t("pluginHub.rating.scoreLabel", { score })}
              disabled={submitting}
              className={cn(
                "flex size-8 items-center justify-center rounded-md transition-colors",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                submitting && "cursor-not-allowed opacity-60",
              )}
              onMouseEnter={() => setHover(score)}
              onMouseLeave={() => setHover(0)}
              onFocus={() => setHover(score)}
              onBlur={() => setHover(0)}
              onClick={() => void submit(score)}
            >
              <Star
                className={cn(
                  "size-5",
                  score <= active
                    ? "fill-yellow-500 text-yellow-500"
                    : "text-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {t("pluginHub.rating.reviews", { count: reviews })}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {mine > 0
          ? t("pluginHub.rating.yourRating", { score: mine })
          : t("pluginHub.rating.prompt")}
      </p>
    </Card>
  );
};
