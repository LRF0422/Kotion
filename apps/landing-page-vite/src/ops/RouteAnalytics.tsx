import { useEffect } from "react";
import { useLocation } from "@kn/common";
import { trackPageview } from "./analytics";

/**
 * 路由级页面浏览埋点。挂在 Layout 内，随 pathname 变化记录 pageview。
 */
export const RouteAnalytics: React.FC = () => {
    const location = useLocation();

    useEffect(() => {
        // path 只保留路径，不带 utm 等查询参数，避免维度被污染
        trackPageview(location.pathname);
    }, [location.pathname]);

    return null;
};
