import { Import, Table2 } from "@kn/icon";
import { ExtensionWrapper } from "@kn/common";
import { TableBubbleMenu, TableStaticMenu } from "./menu";
import { Table } from "./table";
import { TableCell } from "./table-cell";
import { TableHeader } from "./table-header";
import { TableRow } from "./table-row";
import { triggerExcelImport } from "./utilities/excel-import";
import { createT } from "../../i18n";
import React from "react";

export * from "./table";
export * from "./table-cell";
export * from "./table-header";
export * from "./table-row";
export * from "./table-kit";
export * from "./menu";
export * from "./utilities/excel-import";
export * from "./utilities/export";


const t = createT();

export const TableExtension: ExtensionWrapper = {
    extendsion: [Table.configure({
        resizable: true
    }), TableCell, TableHeader, TableRow],
    name: Table.name,
    bubbleMenu: TableBubbleMenu,
    menuConfig: {
        group: 'block',
        menu: TableStaticMenu,
        tooltip: 'editor.tooltip.insertTable',
    },
    slashConfig: [
        {
            icon: <Table2 className="w-4 h-4" />,
            text: t('slashCommands.table'),
            slash: '/table',
            action: (editor) => {
                editor.commands.insertTable()
            }
        },
        {
            icon: <Import className="w-4 h-4" />,
            text: t('slashCommands.importExcel'),
            slash: '/excel',
            action: (editor) => {
                triggerExcelImport(editor);
            }
        }
    ]
}
