import { NodeViewWrapper, NodeViewProps } from "@kn/editor";
import React, { useState, useEffect } from "react";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Button,
    Input,
    Badge,
    cn,
} from "@kn/ui";
import {
    FileText,
    Workflow,
    FileSpreadsheet,
    CheckCircle2,
    ExternalLink,
    RefreshCw,
    Settings,
} from "@kn/icon";

/**
 * Weaver OA Component
 * 
 * Renders different types of Weaver OA content within the editor:
 * - Documents: Display linked OA documents
 * - Workflows: Show workflow status and progress
 * - Forms: Embed interactive forms
 * - Approvals: Track approval processes
 */
export const WeaverOAComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
    const { type, title, documentId, workflowId, formId, approvalId, url, syncStatus } = node.attrs;
    const [isEditing, setIsEditing] = useState(!documentId && !workflowId && !formId && !approvalId);
    const [localTitle, setLocalTitle] = useState(title);
    const [localId, setLocalId] = useState(documentId || workflowId || formId || approvalId || "");

    // Icon mapping for different types
    const getIcon = () => {
        switch (type) {
            case "document":
                return <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
            case "workflow":
                return <Workflow className="h-5 w-5 text-purple-600 dark:text-purple-400" />;
            case "form":
                return <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />;
            case "approval":
                return <CheckCircle2 className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
            default:
                return <FileText className="h-5 w-5" />;
        }
    };

    // Type label mapping
    const getTypeLabel = () => {
        switch (type) {
            case "document":
                return "OA文档 (OA Document)";
            case "workflow":
                return "工作流 (Workflow)";
            case "form":
                return "表单 (Form)";
            case "approval":
                return "审批 (Approval)";
            default:
                return "OA Content";
        }
    };

    const handleSave = () => {
        const idKey =
            type === "document"
                ? "documentId"
                : type === "workflow"
                    ? "workflowId"
                    : type === "form"
                        ? "formId"
                        : "approvalId";

        updateAttributes({
            title: localTitle,
            [idKey]: localId,
        });
        setIsEditing(false);
    };

    const handleSync = () => {
        updateAttributes({ syncStatus: "syncing" });

        // Simulate API call
        setTimeout(() => {
            updateAttributes({ syncStatus: "synced" });
        }, 1000);
    };

    const handleOpenInOA = () => {
        if (url) {
            window.open(url, "_blank");
        } else {
            // Construct OA URL based on type and ID
            const baseUrl = "https://your-weaver-oa.com"; // Replace with actual OA URL
            const path =
                type === "document"
                    ? `/doc/${localId}`
                    : type === "workflow"
                        ? `/workflow/${localId}`
                        : type === "form"
                            ? `/form/${localId}`
                            : `/approval/${localId}`;
            window.open(`${baseUrl}${path}`, "_blank");
        }
    };

    return (
        <NodeViewWrapper>
            <Card
                className={cn(
                    "my-4 transition-all duration-200",
                    "border-2",
                    editor.isEditable && "hover:border-primary/50",
                    !editor.isEditable && "border-transparent"
                )}
            >
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 flex-1">
                            <div className="p-2 rounded-lg bg-muted dark:bg-muted/50">{getIcon()}</div>
                            <div className="flex-1 min-w-0">
                                {isEditing && editor.isEditable ? (
                                    <div className="space-y-2">
                                        <Input
                                            placeholder="标题 (Title)"
                                            value={localTitle}
                                            onChange={(e) => setLocalTitle(e.target.value)}
                                            className="h-8"
                                        />
                                        <Input
                                            placeholder="ID (Document/Workflow/Form/Approval ID)"
                                            value={localId}
                                            onChange={(e) => setLocalId(e.target.value)}
                                            className="h-8"
                                        />
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={handleSave}>
                                                保存 (Save)
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setIsEditing(false)}
                                            >
                                                取消 (Cancel)
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            {title}
                                            {syncStatus === "synced" && (
                                                <Badge variant="secondary" className="text-xs font-normal">
                                                    已同步 (Synced)
                                                </Badge>
                                            )}
                                            {syncStatus === "syncing" && (
                                                <Badge variant="secondary" className="text-xs font-normal">
                                                    <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                                                    同步中 (Syncing)
                                                </Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription className="mt-1">{getTypeLabel()}</CardDescription>
                                    </>
                                )}
                            </div>
                        </div>
                        {!isEditing && editor.isEditable && (
                            <div className="flex gap-1">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={handleSync}
                                    title="同步 (Sync)"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={() => setIsEditing(true)}
                                    title="设置 (Settings)"
                                >
                                    <Settings className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={handleOpenInOA}
                                    title="在OA中打开 (Open in OA)"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardHeader>
                {!isEditing && localId && (
                    <CardContent className="pt-0">
                        <div className="text-sm text-muted-foreground bg-muted dark:bg-muted/30 p-3 rounded-md">
                            <div className="flex items-center justify-between">
                                <span>
                                    ID: <code className="font-mono text-xs">{localId}</code>
                                </span>
                                {type === "workflow" && (
                                    <Badge variant="outline" className="ml-2">
                                        进行中 (In Progress)
                                    </Badge>
                                )}
                                {type === "approval" && (
                                    <Badge variant="outline" className="ml-2">
                                        待审批 (Pending)
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </CardContent>
                )}
            </Card>
        </NodeViewWrapper>
    );
};
