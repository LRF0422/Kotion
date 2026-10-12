import React, { useEffect } from "react";
import { useEntitlements, useOptionalService } from "@kn/common";

/**
 * 云同步的会员门槛。
 *
 * 桌面端默认「只存本地」，云端同步是可选能力；这里把「是否属于付费方案（tier > 0）」
 * 装进 local-first 运行时。权益还在加载时返回 `undefined`（未知），运行时据此保留用户
 * 已有的选择，而不是把同步悄悄关掉。
 *
 * 想放宽为「任何已登录账号都能开启」，把下面的判断改成 `() => true` 即可。
 * 必须渲染在 `EntitlementsProvider` 内部。
 */
export const LocalFirstSyncPolicyBridge: React.FC = () => {
    const localFirst = useOptionalService("localFirst");
    const entitlements = useEntitlements();

    useEffect(() => {
        if (!localFirst) return;
        localFirst.setSyncPolicy(() => (entitlements.loading ? undefined : entitlements.tier > 0));
    }, [localFirst, entitlements.loading, entitlements.tier]);

    return null;
};

export default LocalFirstSyncPolicyBridge;
