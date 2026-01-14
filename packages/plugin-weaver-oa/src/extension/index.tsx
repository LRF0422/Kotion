import { ExtensionWrapper } from "@kn/common";
import { WeaverOANode } from "./weaver-oa-node";
import { FileText, Workflow, FileSpreadsheet, CheckCircle2 } from "@kn/icon";
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
    extendsion: [WeaverOANode],
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
    ],
};
