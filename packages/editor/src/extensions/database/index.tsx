import { ExtensionWrapper } from "@kn/common";
import { Database } from "./database";
import { DatabaseIcon } from "@kn/icon";
import { GridRow } from "./grid-row";
import { GridCell } from "./grid-cell";
import React from "react";

export const DatabaseExtension: ExtensionWrapper = {
    name: Database.name,
    extendsion: [Database, GridRow, GridCell],
    slashConfig: [
        {
            icon: <DatabaseIcon className="h-4 w-4" />,
            slash: '/database',
            text: 'database',
            action: (editor) => {
                console.log('123123');
                editor.commands.insertDatabase()
            }
        }
    ]
}