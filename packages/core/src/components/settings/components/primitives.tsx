import React from "react";
import { cn } from "@kn/ui";

/**
 * 设置面板统一排版原语（Notion 极简风）。
 *
 * 设计约定：
 * - 不使用彩色图标底块；图标一律 monochrome、muted。
 * - 字号只用三档：段标题 text-sm/medium，行标签 text-sm，辅助说明 text-xs/muted。
 * - 分组用细边框 + divide 分隔，不层层套 Card。
 */

/** 一个设置面板的最外层容器：居中、限宽、段落间距统一。 */
export const SettingsPanel: React.FC<React.PropsWithChildren<{ className?: string }>> = ({
    children,
    className,
}) => <div className={cn("mx-auto w-full max-w-2xl space-y-8", className)}>{children}</div>;

/** 一个设置分段：可选标题/说明 + 一个细边框分隔的内容块。 */
export const SettingsSection: React.FC<
    React.PropsWithChildren<{
        title?: React.ReactNode;
        description?: React.ReactNode;
        /** 右上角操作区（如「编辑」按钮）。 */
        action?: React.ReactNode;
        /** 不渲染外层边框容器，children 直接平铺（用于自定义内容）。 */
        bare?: boolean;
        className?: string;
        /** 段落整体的强调色，用于危险区域等。 */
        tone?: "default" | "destructive";
    }>
> = ({ title, description, action, bare, tone = "default", className, children }) => (
    <section className={cn("space-y-3", className)}>
        {(title || description || action) && (
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                    {title && (
                        <h3
                            className={cn(
                                "text-sm font-medium leading-none",
                                tone === "destructive" ? "text-destructive" : "text-foreground",
                            )}
                        >
                            {title}
                        </h3>
                    )}
                    {description && (
                        <p className="text-xs text-muted-foreground">{description}</p>
                    )}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
        )}
        {bare ? (
            children
        ) : (
            <div
                className={cn(
                    "divide-y overflow-hidden rounded-xl border bg-card",
                    tone === "destructive"
                        ? "divide-destructive/20 border-destructive/30"
                        : "divide-border/60 border-border/60",
                )}
            >
                {children}
            </div>
        )}
    </section>
);

/**
 * 设置分段里的一行：左侧标签/说明（可带 monochrome 图标），右侧控件。
 * 窄屏自动竖排。
 */
export const SettingsRow: React.FC<
    React.PropsWithChildren<{
        label?: React.ReactNode;
        description?: React.ReactNode;
        icon?: React.ReactNode;
        /** 右侧控件区。 */
        control?: React.ReactNode;
        className?: string;
    }>
> = ({ label, description, icon, control, className, children }) => (
    <div
        className={cn(
            "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
            className,
        )}
    >
        <div className="flex min-w-0 items-start gap-3">
            {icon && (
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
                    {icon}
                </span>
            )}
            <div className="min-w-0 space-y-0.5">
                {label && <div className="text-sm font-medium text-foreground">{label}</div>}
                {description && (
                    <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
                )}
                {children}
            </div>
        </div>
        {control && <div className="shrink-0 sm:pl-4">{control}</div>}
    </div>
);
