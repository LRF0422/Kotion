import { ExtensionWrapper } from "@kn/common"
import { DocumentNode } from "./document-node"
import { FileText } from "@kn/icon"
import React from "react"
import { documentTools } from "./tools"
import { documentExpertSkill } from "./skills"
import { createT } from "../i18n"

const t = createT();

export const DocumentExtension: ExtensionWrapper = {
    name: DocumentNode.name,
    extendsion: [DocumentNode],
    slashConfig: [
        {
            text: t('slashCommands.document'),
            slash: '/document',
            icon: <FileText className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertDocument()
            },
        },
    ],
    tools: documentTools,
    skills: [documentExpertSkill],
}