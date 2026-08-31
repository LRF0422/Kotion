import {
  AlertTriangle,
  ArrowUpRight,
  BoxIcon,
  Check,
  DownloadIcon,
  LayoutGrid,
  List,
  Loader2,
  SearchIcon,
  Sparkles,
  Star,
  X,
} from "@kn/icon";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@kn/ui";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useApi,
  useNavigator,
  useUploadFile,
  usePluginState,
  useDebounce,
  PLUGIN_CHANGED,
  event,
  logger,
} from "@kn/common";
import { APIS } from "@kn/common";
import { AppContext, useTranslation } from "@kn/common";
import { PluginIcon } from "../PluginIcon";
import {
  toRemotePluginDescriptor,
  enumValue,
  getPluginInstallState,
  PluginRecord,
  toFiniteNumber,
} from "../plugin-model";

const CATEGORIES = ["All", "App", "Feature", "Connector"] as const;
type SortKey = "relevance" | "popular" | "recent" | "rating";
type ViewMode = "grid" | "list";
const PAGE_SIZE = 12;
const FEATURED_COUNT = 3;
const VIEW_STORAGE_KEY = "kn:marketplace-view";

/** 1234 -> 1.2k, so the meta row stays a single compact line. */
const formatCount = (n?: number) => {
  const value = n ?? 0;
  if (value < 1000) return String(value);
  if (value < 1_000_000)
    return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
};

interface MetaProps {
  rating?: number | string;
  downloads?: number | string;
}

// Single star + number keeps the footer to one line (5 stars was the widest element).
const PluginMeta: React.FC<MetaProps> = ({ rating, downloads }) => (
  <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
    <span className="flex items-center gap-1">
      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
      {toFiniteNumber(rating).toFixed(1)}
    </span>
    <span className="flex items-center gap-1">
      <DownloadIcon className="h-3 w-3" />
      {formatCount(toFiniteNumber(downloads))}
    </span>
  </div>
);

interface InstallButtonProps {
  installed: boolean;
  active: boolean;
  incompatible: boolean;
  installing: boolean;
  onInstall: () => void;
  installLabel: string;
  installedLabel: string;
  activeLabel: string;
  incompatibleLabel: string;
  incompatibleHint: string;
}

const InstallButton: React.FC<InstallButtonProps> = ({
  installed,
  active,
  incompatible,
  installing,
  onInstall,
  installLabel,
  installedLabel,
  activeLabel,
  incompatibleLabel,
  incompatibleHint,
}) => {
  if (installed) {
    return (
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium",
          active && "text-green-600 dark:text-green-400",
          incompatible && "text-amber-600 dark:text-amber-400",
          !active && !incompatible && "text-muted-foreground",
        )}
        title={incompatible ? incompatibleHint : undefined}
        aria-label={incompatible ? incompatibleHint : undefined}
      >
        {incompatible ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        {incompatible
          ? incompatibleLabel
          : active
            ? activeLabel
            : installedLabel}
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-7 px-2.5 text-[11px] font-medium"
      disabled={installing}
      onClick={(e) => {
        e.stopPropagation();
        onInstall();
      }}
    >
      {installing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <DownloadIcon className="h-3.5 w-3.5" />
      )}
      <span className="ml-1.5">{installLabel}</span>
    </Button>
  );
};

interface CardProps extends InstallButtonProps {
  plugin: PluginRecord;
  iconUrl?: string;
  highlight?: boolean;
  onOpen: () => void;
  detailsLabel: string;
}

const PluginCard: React.FC<CardProps> = ({
  plugin,
  iconUrl,
  highlight,
  onOpen,
  detailsLabel,
  ...install
}) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onKeyDown={(e) => {
      if (e.key === "Enter") onOpen();
    }}
    className={cn(
      "group flex flex-col rounded-lg border p-3.5 text-left cursor-pointer",
      "transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      highlight ? "border-primary/30 bg-primary/[0.03]" : "border-border/60",
    )}
  >
    <div className="flex items-start gap-3">
      <PluginIcon src={iconUrl} name={plugin.name} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium" title={plugin.name}>
            {plugin.name}
          </span>
          {enumValue(plugin.category) && (
            <Badge
              variant="secondary"
              className="h-4 shrink-0 px-1.5 text-[10px] font-normal"
            >
              {enumValue(plugin.category)}
            </Badge>
          )}
        </div>
        <div
          className="truncate text-[11px] text-muted-foreground"
          title={plugin.developer}
        >
          {[plugin.developer, plugin.maintainer].filter(Boolean).join(" / ")}
        </div>
      </div>
    </div>

    <p
      className="mt-2.5 line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-muted-foreground"
      title={plugin.description}
    >
      {plugin.description}
    </p>

    <div className="mt-3 flex items-center justify-between">
      <PluginMeta rating={plugin.rating} downloads={plugin.downloads} />
      <div className="flex items-center gap-1">
        <span className="hidden items-center text-[11px] text-muted-foreground group-hover:inline-flex">
          {detailsLabel}
          <ArrowUpRight className="ml-0.5 h-3 w-3" />
        </span>
        <InstallButton {...install} />
      </div>
    </div>
  </div>
);

const PluginRow: React.FC<CardProps> = ({
  plugin,
  iconUrl,
  onOpen,
  ...install
}) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onKeyDown={(e) => {
      if (e.key === "Enter") onOpen();
    }}
    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
  >
    <PluginIcon src={iconUrl} name={plugin.name} className="h-9 w-9" />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium">{plugin.name}</span>
        {enumValue(plugin.category) && (
          <Badge
            variant="secondary"
            className="h-4 shrink-0 px-1.5 text-[10px] font-normal"
          >
            {enumValue(plugin.category)}
          </Badge>
        )}
      </div>
      <div
        className="truncate text-xs text-muted-foreground"
        title={plugin.description}
      >
        {plugin.description}
      </div>
    </div>
    <div className="hidden shrink-0 sm:block">
      <PluginMeta rating={plugin.rating} downloads={plugin.downloads} />
    </div>
    <div className="shrink-0">
      <InstallButton {...install} />
    </div>
  </div>
);

export const Marketplace: React.FC = () => {
  const { usePath } = useUploadFile();
  // Plain URL resolver (not a hook) — aliased so it can be called per plugin in loops.
  const resolveUrl = usePath;
  const navigator = useNavigator();
  const { t } = useTranslation();
  const { pluginManager } = useContext(AppContext);

  const [rawPlugins, setRawPlugins] = useState<PluginRecord[]>([]);
  const [selectCategory, setSelectCategory] = useState<string>("All");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== "undefined" &&
    localStorage.getItem(VIEW_STORAGE_KEY) === "list"
      ? "list"
      : "grid",
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const [installing, setInstalling] = useState(false);
  const [installingPluginId, setInstallingPluginId] = useState<string>();
  const [showLoading, setShowLoading] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  // Runtime state for "Active" badge on loaded plugins
  const { loadedPluginNames, incompatiblePlugins, pluginVersion } =
    usePluginState();

  const debouncedKeyword = useDebounce(keyword, { wait: 300 });

  const changeView = useCallback((next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {}
  }, []);

  // Server fetch: only the proven params (category + a generous pageSize).
  // Keyword search and sort are applied client-side below so they always work
  // regardless of backend support. NOTE: pageSize:200 ceiling — if the catalog
  // grows beyond this, switch to server-side search.
  useEffect(() => {
    const loadingTimer = setTimeout(() => setShowLoading(true), 300);
    useApi(APIS.GET_PLUGIN_LIST, {
      pageSize: 200,
      category:
        selectCategory === "All" ? null : selectCategory.toLocaleUpperCase(),
    })
      .then((res) => {
        setRawPlugins(res.data.records ?? []);
      })
      .finally(() => {
        clearTimeout(loadingTimer);
        setShowLoading(false);
      });
  }, [selectCategory, pluginVersion, refetchKey]);

  // Single refetch mechanism on plugin changes (install / uninstall / update)
  useEffect(() => {
    const handlePluginChange = () => setRefetchKey((k) => k + 1);
    event.on(PLUGIN_CHANGED, handlePluginChange);
    return () => {
      event.off(PLUGIN_CHANGED, handlePluginChange);
    };
  }, []);

  // "/" focuses search, Escape clears it — store-style keyboard affordance.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Client-side keyword filter + sort — the reliable source of truth.
  const filtered = useMemo(() => {
    const q = debouncedKeyword.trim().toLowerCase();
    let list = rawPlugins;
    if (q) {
      list = list.filter((p) =>
        [
          p.name,
          p.description,
          p.developer,
          p.maintainer,
          enumValue(p.category),
        ]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q)),
      );
    }
    const out = [...list];
    switch (sort) {
      case "popular":
        out.sort(
          (a, b) => toFiniteNumber(b.downloads) - toFiniteNumber(a.downloads),
        );
        break;
      case "rating":
        out.sort((a, b) => toFiniteNumber(b.rating) - toFiniteNumber(a.rating));
        break;
      case "recent":
        out.sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime(),
        );
        break;
      case "relevance":
      default:
        // With a query, surface name-prefix matches first; otherwise keep server order.
        if (q) {
          out.sort(
            (a, b) =>
              Number(b.name?.toLowerCase().startsWith(q)) -
              Number(a.name?.toLowerCase().startsWith(q)),
          );
        }
    }
    return out;
  }, [rawPlugins, debouncedKeyword, sort]);

  const hasFilters = !!debouncedKeyword.trim() || selectCategory !== "All";

  // Featured strip is only a discovery aid for the unfiltered default view; the
  // picks are then removed from the main list so nothing renders twice.
  const featured = useMemo(() => {
    if (hasFilters || sort !== "relevance" || filtered.length <= PAGE_SIZE / 2)
      return [];
    return [...filtered]
      .sort((a, b) => toFiniteNumber(b.downloads) - toFiniteNumber(a.downloads))
      .slice(0, FEATURED_COUNT);
  }, [filtered, hasFilters, sort]);

  const listed = useMemo(() => {
    if (featured.length === 0) return filtered;
    const featuredIds = new Set(featured.map((p) => p.id));
    return filtered.filter((p) => !featuredIds.has(p.id));
  }, [filtered, featured]);

  const visible = useMemo(
    () => listed.slice(0, visibleCount),
    [listed, visibleCount],
  );

  // Reset paging whenever the filter inputs change.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedKeyword, sort, selectCategory]);

  const installPlugin = async (plugin: PluginRecord) => {
    const payload = toRemotePluginDescriptor(plugin);
    if (!payload || payload.versionId === undefined || payload.versionId === null) {
      logger.warn("Cannot install plugin without a backend version id", {
        name: plugin.name,
        pluginKey: plugin.pluginKey,
        currentVersionId: plugin.currentVersionId,
      });
      return;
    }
    if (installing) return;

    setInstalling(true);
    setInstallingPluginId(String(payload.versionId));
    try {
      await useApi(APIS.INSTALL_PLUGIN, { versionId: payload.versionId });
      await pluginManager?.installPlugin(payload);
      event.emit(PLUGIN_CHANGED, { source: "install" });
    } finally {
      setInstallingPluginId(undefined);
      setInstalling(false);
    }
  };

  const clearFilters = () => {
    setKeyword("");
    setSelectCategory("All");
    setSort("relevance");
  };

  const isFirstLoad = showLoading && rawPlugins.length === 0;
  const hasRawData = rawPlugins.length > 0;

  // Shared per-plugin props for both card and row presentations.
  const cardProps = (plugin: PluginRecord): CardProps => {
    const installState = getPluginInstallState(
      plugin,
      loadedPluginNames,
      incompatiblePlugins,
    );
    return {
      plugin,
      iconUrl: plugin.icon ? resolveUrl(plugin.icon) : undefined,
      installed: installState.installed,
      active: installState.active,
      incompatible: installState.incompatible,
      installing:
        installing &&
        installingPluginId ===
          String(plugin.currentVersionId ?? plugin.currentVersion?.id),
      onInstall: () => installPlugin(plugin),
      onOpen: () => navigator.go({ to: `/plugin-hub/${plugin.id}` }),
      installLabel: t("marketplace.install", "Install"),
      installedLabel: t("marketplace.installed", "Installed"),
      activeLabel: t("marketplace.active", "Active"),
      incompatibleLabel: t("marketplace.incompatible", "Incompatible"),
      incompatibleHint: t(
        "marketplace.incompatibleHint",
        "This plugin is installed but was skipped because its API version is incompatible.",
      ),
      detailsLabel: t("marketplace.details", "Details"),
    };
  };

  const gridClass = "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="flex min-h-full w-full flex-col bg-background">
      {/* Sticky header: identity + primary actions, then the filter bar */}
      <div className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto w-full max-w-6xl px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative w-full max-w-[280px] shrink">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder={t(
                  "marketplace.search-placeholder",
                  "Search plugins...",
                )}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setKeyword("");
                }}
                className="h-8 pl-8 pr-8 text-xs"
              />
              {keyword ? (
                <button
                  onClick={() => setKeyword("")}
                  aria-label={t("marketplace.clear-search", "Clear search")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border px-1 text-[10px] text-muted-foreground sm:block">
                  /
                </kbd>
              )}
            </div>

            {/* Category segmented control */}
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-md bg-muted/60 p-0.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectCategory(cat)}
                  className={cn(
                    "h-7 shrink-0 rounded px-2.5 text-xs font-medium transition-colors",
                    selectCategory === cat
                      ? "bg-background text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`marketplace.category.${cat.toLowerCase()}`, cat)}
                </button>
              ))}
            </div>

            {/* Sort */}
            <Select value={sort} onValueChange={(v: SortKey) => setSort(v)}>
              <SelectTrigger className="h-8 w-[132px] shrink-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance" className="text-xs">
                  {t("marketplace.sort.relevance", "Relevance")}
                </SelectItem>
                <SelectItem value="popular" className="text-xs">
                  {t("marketplace.sort.popular", "Most Popular")}
                </SelectItem>
                <SelectItem value="recent" className="text-xs">
                  {t("marketplace.sort.recent", "Recently Added")}
                </SelectItem>
                <SelectItem value="rating" className="text-xs">
                  {t("marketplace.sort.rating", "Highest Rated")}
                </SelectItem>
              </SelectContent>
            </Select>

            {/* View switch */}
            <TooltipProvider delayDuration={300}>
              <div className="hidden shrink-0 items-center gap-0.5 rounded-md bg-muted/60 p-0.5 sm:flex">
                {[
                  {
                    mode: "grid" as ViewMode,
                    icon: LayoutGrid,
                    label: t("marketplace.view.grid", "Grid view"),
                  },
                  {
                    mode: "list" as ViewMode,
                    icon: List,
                    label: t("marketplace.view.list", "List view"),
                  },
                ].map(({ mode, icon: Icon, label }) => (
                  <Tooltip key={mode}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => changeView(mode)}
                        aria-label={label}
                        aria-pressed={view === mode}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded transition-colors",
                          view === mode
                            ? "bg-background text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:px-6 sm:py-5">
        {isFirstLoad ? (
          <div className={gridClass}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="rounded-lg border border-border/60 p-3.5"
              >
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-3/5" />
                    <Skeleton className="h-2.5 w-2/5" />
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <Skeleton className="h-2.5 w-full" />
                  <Skeleton className="h-2.5 w-4/5" />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-16 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            className="min-h-[40vh] w-full max-w-none flex-col justify-center border-none hover:bg-background"
            title={
              hasRawData
                ? t("marketplace.empty.no-match", "No matches for your search")
                : t("marketplace.empty.none", "No plugins found")
            }
            icons={[BoxIcon]}
            description={
              hasRawData
                ? t(
                    "marketplace.empty.no-match-desc",
                    "Try a different keyword or sort option",
                  )
                : t(
                    "marketplace.empty.none-desc",
                    "Try adjusting your category filter",
                  )
            }
            action={
              hasFilters
                ? {
                    label: t("marketplace.clear-filters", "Clear filters"),
                    onClick: clearFilters,
                  }
                : undefined
            }
          />
        ) : (
          <div className="space-y-5">
            {/* Featured picks (default view only) */}
            {featured.length > 0 && (
              <section className="space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("marketplace.featured", "Featured")}
                  </h2>
                </div>
                <div className={gridClass}>
                  {featured.map((plugin, index) => (
                    <PluginCard
                      key={plugin.id ?? `featured-${index}`}
                      highlight
                      {...cardProps(plugin)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {hasFilters
                    ? t("marketplace.results", "Results")
                    : t("marketplace.all-plugins", "All plugins")}
                  <span className="ml-1.5 font-normal normal-case tracking-normal">
                    {listed.length}
                  </span>
                </h2>
                {hasFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={clearFilters}
                  >
                    <X className="mr-1 h-3 w-3" />
                    {t("marketplace.clear-filters", "Clear filters")}
                  </Button>
                )}
              </div>

              {view === "grid" ? (
                <div className={gridClass}>
                  {visible.map((plugin, index) => (
                    <PluginCard
                      key={plugin.id ?? index}
                      {...cardProps(plugin)}
                    />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
                  {visible.map((plugin, index) => (
                    <PluginRow
                      key={plugin.id ?? index}
                      {...cardProps(plugin)}
                    />
                  ))}
                </div>
              )}

              {visibleCount < listed.length && (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  >
                    {t("marketplace.load-more", "Load more")}
                    <span className="ml-1">
                      ({listed.length - visibleCount})
                    </span>
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
