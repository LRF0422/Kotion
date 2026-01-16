import { Alert, AlertDescription, AlertTitle } from "@kn/ui";
import { Button } from "@kn/ui";
import { Archive as ArchiveIcon, Info } from "@kn/icon";
import React from "react";
import { useTranslation } from "@kn/common";


export const Archive: React.FC = () => {
    const { t } = useTranslation()

    return <div className="space-y-6 max-w-3xl">
        <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <ArchiveIcon className="h-5 w-5" />
                {t("space-settings.archive.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
                {t("space-settings.archive.description")}
            </p>
        </div>

        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
            <Info className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-900 dark:text-amber-100">{t("space-settings.archive.warning")}</AlertTitle>
            <AlertDescription className="text-amber-800 dark:text-amber-200">
                <ul className="list-disc list-inside space-y-2 mt-2">
                    <li>{t("space-settings.archive.warning_list.hide_nav")}</li>
                    <li>{t("space-settings.archive.warning_list.preserve_content")}</li>
                    <li>{t("space-settings.archive.warning_list.restore_anytime")}</li>
                    <li>{t("space-settings.archive.warning_list.reduce_clutter")}</li>
                </ul>
            </AlertDescription>
        </Alert>

        <div className="flex items-center gap-3 pt-2">
            <Button
                variant="outline"
                className="min-w-[150px]"
            >
                <ArchiveIcon className="h-4 w-4 mr-2" />
                {t("space-settings.archive.archive_btn")}
            </Button>
        </div>
    </div>
}