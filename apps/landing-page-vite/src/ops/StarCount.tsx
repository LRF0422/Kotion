import React, { useEffect, useState } from "react";
import { Star } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { GITHUB_URL } from "../constants/links";
import { fetchGitHubStars } from "./github";
import { track } from "./analytics";

const formatStars = (value: number): string =>
    value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);

/** Hero 区的 GitHub Star 社交证明。 */
export const StarCount: React.FC<{ className?: string }> = ({ className }) => {
    const { t } = useTranslation();
    const [stars, setStars] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        void fetchGitHubStars().then((value) => {
            if (!cancelled) setStars(value);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (stars === null || stars <= 0) return null;

    return (
        <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => track("cta_click", { location: "hero-star", target: "github" })}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border hover:opacity-80 ${className ?? ""}`}
            style={{ background: "var(--kn-paper)", borderColor: "var(--kn-line)", color: "var(--kn-ink-soft)" }}
        >
            <Star className="w-3.5 h-3.5" style={{ color: "var(--scene-ai-500)" }} />
            {formatStars(stars)} {t("github.stars")}
        </a>
    );
};
