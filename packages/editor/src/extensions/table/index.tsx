import { Table2 } from "@kn/icon";
import { ExtensionWrapper } from "@kn/common";
import { TableBubbleMenu, TableStaticMenu } from "./menu";
import { Table } from "./table";
import { TableCell } from "./table-cell";
import { TableHeader } from "./table-header";
import { TableRow } from "./table-row";
import React from "react";

export * from "./table";
export * from "./table-cell";
export * from "./table-header";
export * from "./table-row";
export * from "./table-kit";
export * from "./menu";


export const TableExtension: ExtensionWrapper = {
    extendsion: [Table.configure({
        resizable: true
    }), TableCell, TableHeader, TableRow],
    name: Table.name,
    bubbleMenu: TableBubbleMenu,
    menuConfig: {
        group: 'block',
        menu: TableStaticMenu
    },
    slashConfig: [
        {
            icon: <Table2 className="w-4 h-4" />,
            text: "表格",
            slash: '/table',
            action: (editor) => {
                editor.commands.insertTable()
            }
        }
    ]
}
