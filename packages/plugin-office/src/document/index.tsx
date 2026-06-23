import { ExtensionWrapper } from "@kn/common"
import { DocumentNode } from "./document-node"
import { FileText } from "@kn/icon"
import React from "react"
import { documentTools } from "./tools"
import { documentExpertSkill } from "./skills"

export const DocumentExtension: ExtensionWrapper = {
    name: DocumentNode.name,
    extendsion: [DocumentNode],
    slashConfig: [
        {
            text: 'document',
            slash: '/document',
            icon: <FileText className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertDocument()
            },
        },
        {
            text: 'word',
            slash: '/word',
            icon: <FileText className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertDocument()
            },
        },
        {
            text: '文档',
            slash: '/文档',
            icon: <FileText className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertDocument()
            },
        },
    ],
    tools: documentTools,
    skills: [documentExpertSkill],
}