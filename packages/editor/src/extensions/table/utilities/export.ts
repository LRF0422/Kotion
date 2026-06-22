import * as XLSX from "xlsx";
import { Editor } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";

import { findTable } from "./index";

/**
 * Export helpers for the inline table: dump the table around the current
 * selection to CSV / Excel, or copy it to the clipboard as a GitHub-flavored
 * Markdown table. The matrix is built from each cell's plain text content
 * (merged cells are exported best-effort by their text).
 */

/** Resolve the table node around the current selection, if any. */
const getActiveTable = (editor: Editor): PMNode | null => {
  const found = findTable(editor.state.selection);
  return found?.node ?? null;
};

/** Build a 2D array of cell text from a table node. */
export const tableToMatrix = (table: PMNode): string[][] => {
  const matrix: string[][] = [];
  table.forEach(row => {
    if (row.type.name !== "tableRow") return;
    const cells: string[] = [];
    row.forEach(cell => cells.push(cell.textContent));
    matrix.push(cells);
  });
  return matrix;
};

/** Trigger a browser download for the given Blob. */
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/** Escape a value for a CSV field. */
const escapeCsv = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * Export the active table as a CSV file. Returns false when there is no
 * table at the selection.
 */
export const exportTableToCSV = (editor: Editor): boolean => {
  const table = getActiveTable(editor);
  if (!table) return false;

  const matrix = tableToMatrix(table);
  const csv = matrix.map(row => row.map(escapeCsv).join(",")).join("\r\n");

  // Prepend a BOM so Excel detects UTF-8 (important for CJK content).
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;"
  });
  downloadBlob(blob, "table.csv");
  return true;
};

/** Export the active table as an .xlsx file. */
export const exportTableToExcel = (editor: Editor): boolean => {
  const table = getActiveTable(editor);
  if (!table) return false;

  const matrix = tableToMatrix(table);
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, "table.xlsx");
  return true;
};

/** Escape a value for a Markdown table cell. */
const escapeMarkdown = (value: string): string =>
  value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/**
 * Copy the active table to the clipboard as a GitHub-flavored Markdown table.
 * The first row is treated as the header. Returns a promise that resolves to
 * false when there is no table at the selection.
 */
export const copyTableAsMarkdown = async (editor: Editor): Promise<boolean> => {
  const table = getActiveTable(editor);
  if (!table) return false;

  const matrix = tableToMatrix(table);
  if (matrix.length === 0) return false;

  const toRow = (cells: string[]) =>
    `| ${cells.map(escapeMarkdown).join(" | ")} |`;

  const [header, ...rest] = matrix;
  const lines = [
    toRow(header),
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rest.map(toRow)
  ];

  await navigator.clipboard.writeText(lines.join("\n"));
  return true;
};
