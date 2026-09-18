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
} from '@kn/ui'

/** 升级入口占位：本期不做支付。 */
export const UpgradeDialog: React.FC<{ trigger?: React.ReactNode }> = ({ trigger }) => {
    const [open, setOpen] = useState(false)
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger ?? <Button>升级方案</Button>}</DialogTrigger>
            <DialogContent className="md:max-w-md">
                <DialogHeader>
                    <DialogTitle>升级方案</DialogTitle>
                    <DialogDescription>支付功能即将开放。</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2 text-sm text-muted-foreground">
                    <p>目前可通过平台管理员开通 Pro / Pro+，后续将开放自助升级与兑换码。</p>
                </div>
                <DialogFooter>
                    <Button className="h-11" onClick={() => setOpen(false)}>知道了</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
