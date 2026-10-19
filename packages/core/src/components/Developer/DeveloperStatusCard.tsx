/**
 * Developer verification entry point for the plugin manager ("管理插件").
 *
 * Shows the current status and opens the same verification dialog the publish
 * buttons use, so there is one place to check progress or resubmit after a
 * rejection. Managing plugins still requires APPROVED — the backend enforces it
 * on submit / resubmit / publish; this card is the discoverable entry.
 */
import { Badge, cn } from '@kn/ui'
import { ChevronRight, Clock, ShieldAlert, ShieldCheck } from '@kn/icon'
import { useTranslation } from '@kn/common'
import React from 'react'

import { developerStatus, useDeveloperProfile } from './developer-api'
import { DeveloperVerificationDialog } from './DeveloperVerificationDialog'

interface DeveloperStatusCardProps {
    className?: string
}

export const DeveloperStatusCard: React.FC<DeveloperStatusCardProps> = ({ className }) => {
    const { t } = useTranslation()
    const { profile, verified } = useDeveloperProfile()
    const [open, setOpen] = React.useState(false)
    const status = developerStatus(profile)

    const label = verified
        ? t('developerVerification.status.approved', '已认证')
        : status === 'PENDING'
          ? t('developerVerification.status.pending', '审核中')
          : status === 'REJECTED'
            ? t('developerVerification.status.rejected', '已驳回')
            : status === 'SUSPENDED'
              ? t('developerVerification.status.suspended', '已撤销')
              : t('developerVerification.status.none', '未认证')

    const tone = verified
        ? 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
        : status === 'PENDING'
          ? 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400'
          : status === 'REJECTED' || status === 'SUSPENDED'
            ? 'border-transparent bg-red-500/15 text-red-600 dark:text-red-400'
            : undefined

    const Icon = verified ? ShieldCheck : status === 'PENDING' ? Clock : ShieldAlert

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm transition-colors hover:bg-muted',
                    className,
                )}
            >
                <span className="flex min-w-0 items-center gap-2">
                    <Icon className={cn('size-4 shrink-0', verified ? 'text-emerald-600' : 'text-muted-foreground')} />
                    <span className="truncate">{t('developerVerification.entry', '开发者认证')}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                    <Badge variant="outline" className={tone}>
                        {label}
                    </Badge>
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                </span>
            </button>
            <DeveloperVerificationDialog open={open} onOpenChange={setOpen} />
        </>
    )
}
