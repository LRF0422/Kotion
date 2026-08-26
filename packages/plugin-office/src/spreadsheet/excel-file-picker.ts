export function triggerExcelFileImport(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv";
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      resolve(file);
    };
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
