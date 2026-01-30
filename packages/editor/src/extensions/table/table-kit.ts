import { AnyExtension } from "@tiptap/core";

import { Table } from "./table";
import { TableCell } from "./table-cell";
import { TableHeader } from "./table-header";
import { TableRow } from "./table-row";

/**
 * Table extensions bundle with optimized configuration
 * 
 * Features:
 * - Resizable columns
 * - Minimum cell width of 50px
 * - Custom table view with performance optimizations
 * - React root management for cell controls
 */
export const TableExtensions: AnyExtension[] = [
  Table.configure({
    resizable: true,
    cellMinWidth: 50
  }),
  TableCell,
  TableHeader,
  TableRow
];
