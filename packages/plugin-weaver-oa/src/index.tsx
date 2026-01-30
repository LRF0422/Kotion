import { KPlugin, PluginConfig } from "@kn/common";
import { WeaverOAExtension } from "./extension";
import { FileText } from "@kn/icon";
import React from "react";

/**
 * Weaver OA Plugin Configuration Interface
 * Extends the base PluginConfig for Weaver OA specific settings
 */
interface WeaverOAPluginConfig extends PluginConfig {
    // Add custom configuration options here if needed
    apiEndpoint?: string;
    syncInterval?: number;
}

/**
 * Weaver OA Plugin Class
 * Provides integration with Weaver OA system for document management,
 * workflow automation, and collaboration features
 */
class WeaverOAPlugin extends KPlugin<WeaverOAPluginConfig> { }

/**
 * Weaver OA Plugin Instance
 * 
 * Features:
 * - Document synchronization with Weaver OA
 * - Workflow integration
 * - Form embedding
 * - Approval process tracking
 * - User authentication integration
 */
export const weaverOA = new WeaverOAPlugin({
    status: "ACTIVE",
    name: "WeaverOA",
    editorExtension: [WeaverOAExtension],
    locales: {
        zh: {
            translation: {
                "weaver-oa": {
                    title: "泛微OA",
                    description: "泛微OA系统集成",
                    "insert-document": "插入OA文档",
                    "sync-workflow": "同步工作流",
                    "embed-form": "嵌入表单",
                    "approval-track": "审批跟踪",
                    "todo-kanban": "待办看板",
                    "process-init": "流程发起",
                    "todo-kanban-desc": "OA流程待办事项看板",
                    "process-init-desc": "浏览并发起OA流程",
                },
                "finereport": {
                    title: "帆软BI",
                    description: "帆软BI报表集成",
                    "view-dataset": "查看数据集",
                    "config-chart": "配置图表",
                    "dataset-desc": "浏览和查看可用的数据集",
                    "chart-desc": "配置数据源和图表类型",
                },
            },
        },
        en: {
            translation: {
                "weaver-oa": {
                    title: "Weaver OA",
                    description: "Weaver OA System Integration",
                    "insert-document": "Insert OA Document",
                    "sync-workflow": "Sync Workflow",
                    "embed-form": "Embed Form",
                    "approval-track": "Approval Tracking",
                    "todo-kanban": "Todo Kanban",
                    "process-init": "Start Workflow",
                    "todo-kanban-desc": "OA workflow todo items kanban board",
                    "process-init-desc": "Browse and initiate OA workflows",
                },
                "finereport": {
                    title: "FineReport BI",
                    description: "FineReport BI Integration",
                    "view-dataset": "View Datasets",
                    "config-chart": "Configure Chart",
                    "dataset-desc": "Browse and view available datasets",
                    "chart-desc": "Configure data source and chart type",
                },
            },
        },
    },
});
