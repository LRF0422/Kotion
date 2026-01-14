import * as XLSX from 'xlsx';
import { Editor } from '@tiptap/core';

/**
 * Parse Excel file and return data as 2D array
 */
export const parseExcelFile = async (file: File): Promise<string[][]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to 2D array
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '' // Default value for empty cells
        });
        
        // Convert all values to strings
        const stringData: string[][] = jsonData.map(row => 
          row.map(cell => {
            if (cell === null || cell === undefined) return '';
            return String(cell);
          })
        );
        
        resolve(stringData);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsBinaryString(file);
  });
};

/**
 * Import Excel data into table
 */
export const importExcelToTable = async (editor: Editor, file: File) => {
  try {
    const data = await parseExcelFile(file);
    
    if (!data || data.length === 0) {
      throw new Error('No data found in Excel file');
    }
    
    // Calculate max columns
    const maxCols = Math.max(...data.map(row => row.length));
    if (maxCols === 0) {
      throw new Error('No columns found in Excel file');
    }
    
    // Ensure all rows have the same number of columns
    const normalizedData = data.map(row => {
      const normalizedRow = [...row];
      while (normalizedRow.length < maxCols) {
        normalizedRow.push('');
      }
      return normalizedRow;
    });
    
    const rows = normalizedData.length;
    const cols = maxCols;
    
    // Build table content with data
    const tableContent = {
      type: 'table',
      content: normalizedData.map(rowData => ({
        type: 'tableRow',
        content: rowData.map(cellContent => ({
          type: 'tableCell',
          content: cellContent ? [{
            type: 'paragraph',
            content: cellContent ? [{
              type: 'text',
              text: cellContent
            }] : []
          }] : [{
            type: 'paragraph'
          }]
        }))
      }))
    };
    
    // Insert table with content
    editor
      .chain()
      .focus()
      .insertContent(tableContent)
      .run();
    
    return true;
  } catch (error) {
    console.error('Error importing Excel:', error);
    throw error;
  }
};

/**
 * Create file input and handle Excel import
 */
export const triggerExcelImport = (editor: Editor, callback?: (success: boolean) => void) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.style.display = 'none';
  
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    try {
      await importExcelToTable(editor, file);
      callback?.(true);
    } catch (error) {
      console.error('Failed to import Excel file:', error);
      alert('Failed to import Excel file: ' + (error as Error).message);
      callback?.(false);
    } finally {
      input.remove();
    }
  };
  
  document.body.appendChild(input);
  input.click();
};
