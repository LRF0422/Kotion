import { Alert, AlertTitle, AlertDescription } from "@kn/ui"
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@kn/ui"
import { Button } from "@kn/ui"
import { toast } from "@kn/ui"
import { Trash2, AlertTriangle, LoaderCircle } from "@kn/icon"
import React, { useContext, useState } from "react"
import { useNavigator, useSpacePageService, useTranslation } from "@kn/common"
import { SettingContext } from ".."

export const Delete: React.FC = () => {
    const { t } = useTranslation()
    const { space, spaceId } = useContext(SettingContext)
    const navigator = useNavigator()
    const service = useSpacePageService()

    const [confirmOpen, setConfirmOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const handleDelete = async () => {
        if (!spaceId) return
        setSubmitting(true)
        try {
            await service.spaces.deleteSpace(spaceId)
            toast.success(t("space-settings.delete.success", { name: space?.name }))
            navigator.go({ to: "/spaces" })
        } catch (error) {
            toast.error(t("space-settings.delete.error"))
            setSubmitting(false)
        }
    }

    return <div className="space-y-6 max-w-3xl">
        <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t("space-settings.delete.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
                {t("space-settings.delete.description")}
            </p>
        </div>

        <Alert variant="destructive">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle>{t("space-settings.delete.warning_title")}</AlertTitle>
            <AlertDescription>
                <ul className="list-disc list-inside space-y-2 mt-2">
                    <li>{t("space-settings.delete.warning_list.remove_immediately")}</li>
                    <li>{t("space-settings.delete.warning_list.admin_restore")}</li>
                    <li>{t("space-settings.delete.warning_list.all_content_deleted")}</li>
                    <li>{t("space-settings.delete.warning_list.consider_archive")}</li>
                </ul>
            </AlertDescription>
        </Alert>

        <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/5">
            <p className="text-sm font-medium mb-3">{t("space-settings.delete.consider_title")}</p>
            <ul className="text-sm space-y-1.5 text-muted-foreground">
                <li>• {t("space-settings.delete.consider_list.backup")}</li>
                <li>• {t("space-settings.delete.consider_list.notify_members")}</li>
                <li>• {t("space-settings.delete.consider_list.archive_option")}</li>
            </ul>
        </div>

        <div className="flex items-center gap-3 pt-2">
            <Button
                variant="destructive"
                className="min-w-[150px]"
                disabled={submitting}
                onClick={() => setConfirmOpen(true)}
            >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("space-settings.delete.delete_btn")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("space-settings.delete.undo_warning")}</p>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!o && !submitting) setConfirmOpen(false) }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("space-settings.delete.confirm_title")}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("space-settings.delete.confirm_description", { name: space?.name })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={submitting}>
                        {t("space-settings.delete.confirm_cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={submitting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={(e) => { e.preventDefault(); handleDelete() }}
                    >
                        {submitting && <LoaderCircle className="h-4 w-4 mr-1 animate-spin" />}
                        {t("space-settings.delete.delete_btn")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
}
