import { ExtensionWrapper } from "@kn/common";
import { WeaverOANode } from "./weaver-oa-node";
import { OATodoKanbanNode } from "./oa-todo-kanban-node";
import { OAProcessInitNode } from "./oa-process-init-node";
import { FineReportDatasetNode } from "./finereport-dataset-node";
import { FineReportChartNode } from "./finereport-chart-node";
import { FileText, Workflow, FileSpreadsheet, CheckCircle2, Clock, Play, Database, BarChart3 } from "@kn/icon";
import React from "react";

/**
 * Weaver OA Extension
 * 
 * Provides editor integration for Weaver OA features including:
 * - Document embedding
 * - Workflow visualization
 * - Form integration
 * - Approval tracking
 */
export const WeaverOAExtension: ExtensionWrapper = {
    name: "weaverOA",
    extendsion: [WeaverOANode, OATodoKanbanNode, OAProcessInitNode, FineReportDatasetNode, FineReportChartNode],
    slashConfig: [
        {
            divider: true,
            title: "泛微OA集成 (Weaver OA Integration)",
        },
        {
            icon: <FileText className="h-4 w-4" />,
            text: "插入OA文档 (Insert OA Document)",
            slash: "/weaver-doc",
            action: (editor) => {
                editor.commands.insertContent({
                    type: WeaverOANode.name,
                    attrs: {
                        type: "document",
                        documentId: "",
                        title: "OA Document",
                    },
                });
            },
        },
        {
            icon: <Workflow className="h-4 w-4" />,
            text: "插入工作流 (Insert Workflow)",
            slash: "/weaver-workflow",
            action: (editor) => {
                editor.commands.insertContent({
                    type: WeaverOANode.name,
                    attrs: {
                        type: "workflow",
                        workflowId: "",
                        title: "Workflow",
                    },
                });
            },
        },
        {
            icon: <FileSpreadsheet className="h-4 w-4" />,
            text: "嵌入表单 (Embed Form)",
            slash: "/weaver-form",
            action: (editor) => {
                editor.commands.insertContent({
                    type: WeaverOANode.name,
                    attrs: {
                        type: "form",
                        formId: "",
                        title: "OA Form",
                    },
                });
            },
        },
        {
            icon: <CheckCircle2 className="h-4 w-4" />,
            text: "审批流程 (Approval Process)",
            slash: "/weaver-approval",
            action: (editor) => {
                editor.commands.insertContent({
                    type: WeaverOANode.name,
                    attrs: {
                        type: "approval",
                        approvalId: "",
                        title: "Approval Process",
                    },
                });
            },
        },
        {
            icon: <Clock className="h-4 w-4" />,
            text: "待办看板 (Todo Kanban)",
            slash: "/weaver-todo",
            action: (editor) => {
                editor.commands.insertContent({
                    type: OATodoKanbanNode.name,
                    attrs: {
                        title: "OA流程待办看板",
                    },
                });
            },
        },
        {
            icon: <Play className="h-4 w-4" />,
            text: "流程发起 (Start Workflow)",
            slash: "/weaver-start",
            action: (editor) => {
                editor.commands.insertContent({
                    type: OAProcessInitNode.name,
                    attrs: {
                        title: "OA流程发起",
                    },
                });
            },
        },
        {
            divider: true,
            title: "帆软BI集成 (FineReport BI)",
        },
        {
            icon: <Database className="h-4 w-4" />,
            text: "数据集查看 (View Datasets)",
            slash: "/finereport-data",
            action: (editor) => {
                editor.commands.insertContent({
                    type: FineReportDatasetNode.name,
                    attrs: {
                        title: "帆软BI - 数据集",
                    },
                });
            },
        },
        {
            icon: <BarChart3 className="h-4 w-4" />,
            text: "图表配置 (Chart Config)",
            slash: "/finereport-chart",
            action: (editor) => {
                editor.commands.insertContent({
                    type: FineReportChartNode.name,
                    attrs: {
                        title: "帆软BI - 图表配置",
                    },
                });
            },
        },
    ],
};
