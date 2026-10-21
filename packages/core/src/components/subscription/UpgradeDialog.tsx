import React, { useState } from 'react'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Input,
    Label,
    toast,
} from '@kn/ui'
import { APIS, useApi, useEntitlements } from '@kn/common'

/** 升级入口：本期不做支付，开通走兑换码或平台管理员，并提供试用。 */
export interface UpgradeDialogProps {
    trigger?: React.ReactNode
    initialPlanName?: string
    /**
     * 受控开关。省略时保持原有用法：由 `trigger` 打开。
     * 账号菜单等外部入口需要直接打开弹窗时传 `open` + `onOpenChange`。
     */
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

export const UpgradeDialog: React.FC<UpgradeDialogProps> = ({
    trigger,
    initialPlanName,
    open: controlledOpen,
    onOpenChange,
}) => {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : uncontrolledOpen
    const setOpen = (next: boolean) => {
        if (!isControlled) setUncontrolledOpen(next)
        onOpenChange?.(next)
    }
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const { refresh } = useEntitlements()

    const redeem = async () => {
        if (!code.trim()) return
        setBusy(true)
        try {
            await useApi(APIS.POST_SUBSCRIPTION_REDEEM, undefined, { code: code.trim() })
            toast.success('兑换成功')
            setCode('')
            await refresh()
            setOpen(false)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error))
        } finally {
            setBusy(false)
        }
    }

    const startTrial = async () => {
        setBusy(true)
        try {
            await useApi(APIS.POST_SUBSCRIPTION_TRIAL)
            toast.success('试用已开通')
            await refresh()
            setOpen(false)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger ? (
                <DialogTrigger asChild>{trigger}</DialogTrigger>
            ) : !isControlled ? (
                // Preserve the original default trigger for uncontrolled callers.
                <DialogTrigger asChild>
                    <Button>升级方案</Button>
                </DialogTrigger>
            ) : null}
            <DialogContent className="md:max-w-md">
                <DialogHeader>
                    <DialogTitle>开通方案</DialogTitle>
                    <DialogDescription>
                        {initialPlanName ? '目标方案：' + initialPlanName + '。' : ''}支付功能尚未开放，开通走兑换码或平台管理员。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>兑换码</Label>
                        <div className="flex gap-2">
                            <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="输入兑换码" />
                            <Button onClick={redeem} disabled={busy || !code.trim()}>
                                兑换
                            </Button>
                        </div>
                    </div>
                    <div className="rounded-lg border border-border/60 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-medium text-foreground">免费试用 7 天</div>
                                <div className="text-xs text-muted-foreground">每个账号限一次</div>
                            </div>
                            <Button variant="outline" size="sm" onClick={startTrial} disabled={busy}>
                                试用
                            </Button>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">也可以联系平台管理员直接开通 Pro / Pro+。</p>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        关闭
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
