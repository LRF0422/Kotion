import { Alert, AlertDescription, AlertTitle } from "@kn/ui";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@kn/ui";
import { Button } from "@kn/ui";
import { toast } from "@kn/ui";
import { Archive as ArchiveIcon, ArchiveRestore, Info, LoaderCircle, CheckCircle2 } from "@kn/icon";
import React, { useContext, useState } from "react";
import { useApi, useTranslation } from "@kn/common";
import { APIS } from "../../../../api";
import { SettingContext } from "..";


export const Archive: React.FC = () => {
    const { t } = useTranslation()
    const { space, spaceId } = useContext(SettingContext)

    const [archived, setArchived] = useState<boolean>(!!space?.archived)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const handleArchive = async () => {
        setSubmitting(true)
        try {
            await useApi(APIS.ARCHIVE_SPACE, { id: spaceId })
            setArchived(true)
            setConfirmOpen(false)
            toast.success(t("space-settings.archive.success"), {
                icon: <CheckCircle2 className="h-4 w-4" />
            })
        } catch (error) {
            toast.error(t("space-settings.archive.error"))
        } finally {
            setSubmitting(false)
        }
    }

    const handleRestore = async () => {
        setSubmitting(true)
        try {
            await useApi(APIS.UNARCHIVE_SPACE, { id: spaceId })
            setArchived(false)
            toast.success(t("space-settings.archive.restore_success"), {
                icon: <CheckCircle2 className="h-4 w-4" />
            })
        } catch (error) {
            toast.error(t("space-settings.archive.error"))
        } finally {
            setSubmitting(false)
        }
    }

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

        {archived ? (
            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-blue-900 dark:text-blue-100">{t("space-settings.archive.archived_title")}</AlertTitle>
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                    {t("space-settings.archive.archived_description")}
                </AlertDescription>
            </Alert>
        ) : (
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
        )}

        <div className="flex items-center gap-3 pt-2">
            {archived ? (
                <Button
                    variant="outline"
                    className="min-w-[150px]"
                    disabled={submitting}
                    onClick={handleRestore}
                >
                    {submitting
                        ? <LoaderCircle className="h-4 w-4 mr-2 animate-spin" />
                        : <ArchiveRestore className="h-4 w-4 mr-2" />}
                    {t("space-settings.archive.restore_btn")}
                </Button>
            ) : (
                <Button
                    variant="outline"
                    className="min-w-[150px]"
                    disabled={submitting}
                    onClick={() => setConfirmOpen(true)}
                >
                    <ArchiveIcon className="h-4 w-4 mr-2" />
                    {t("space-settings.archive.archive_btn")}
                </Button>
            )}
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!o) setConfirmOpen(false) }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("space-settings.archive.confirm_title")}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("space-settings.archive.confirm_description", { name: space?.name })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={submitting}>
                        {t("space-settings.archive.confirm_cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={submitting}
                        onClick={(e) => { e.preventDefault(); handleArchive() }}
                    >
                        {submitting && <LoaderCircle className="h-4 w-4 mr-1 animate-spin" />}
                        {t("space-settings.archive.archive_btn")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
}
