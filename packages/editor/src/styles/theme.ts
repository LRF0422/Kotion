const colors = {
  text: "rgba(0, 0, 0, .85)",
  background: "rgb(251,251,251)",
  primary: "#0064fa",
  greyLight: "#F4F7FA",
  grey: "#E8EBED",
  greyMid: "#C5CCD3",
  greyDark: "#DAE1E9"
};

const darkColors = {
  text: "rgba(255, 255, 255, .87)",
  background: "rgb(18, 18, 18)",
  primary: "#3b82f6",
  greyLight: "#1f2937",
  grey: "#374151",
  greyMid: "#6b7280",
  greyDark: "#4b5563"
};

export const base = {
  ...colors,
  border: "1px solid #eeeeee ",

  fontFamily:
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen, Ubuntu,Cantarell,'Open Sans','Helvetica Neue',sans-serif",
  fontFamilyMono:
    "'SFMono-Regular',Consolas,'Liberation Mono', Menlo, Courier,monospace",

  borderColor: "#dee0e3",
  borderRadius: "5px",
  boxShadow: "rgb(0 0 0/10%) 0 0 10px",

  horizontalRule: "#dee0e3",

  bubbleMenuBoxshadow: "rgb(0 0 0/10%) 0 0 10px",

  codeBlockBorderColor: "#dee0e3",

  blockquoteBorderColor: "#bbbfc5",
  blockquoteTextColor: "#1f2329b3",

  // Light mode table colors
  tableBorderColor: "#e5e7eb",
  tableHeaderBgColor: "#f9fafb",
  tableSelectedBorderColor: "#3b82f6",
  tableSelectedCellBgColor: "#dbeafe",
  tableSelectedControlBgColor: "#3b82f6",
  tableResizeHandleBgColor: "#93c5fd",
  tableCellBgColor: "#ffffff",
  tableHoverBgColor: "#f3f4f6",

  slashMenuColor: "rgba(0, 0, 0, 0.85)",
  slashMenuTitleColor: "rgba(0, 0, 0, 0.45)",
  slashMenuBoxshadow: "rgb(0 0 0/10%) 0 0 10px",
  slashMenuHoverBgColor: "rgb(46 50 56 / 5%)"
};

export const light = {
  ...base
};

export const dark = {
  ...base,
  ...darkColors,
  border: "1px solid #374151",
  borderColor: "#374151",
  boxShadow: "rgb(0 0 0/30%) 0 0 10px",
  horizontalRule: "#374151",
  bubbleMenuBoxshadow: "rgb(0 0 0/30%) 0 0 10px",
  codeBlockBorderColor: "#374151",
  blockquoteBorderColor: "#4b5563",
  blockquoteTextColor: "rgba(255, 255, 255, 0.7)",

  // Dark mode table colors
  tableBorderColor: "#374151",
  tableHeaderBgColor: "#1f2937",
  tableSelectedBorderColor: "#60a5fa",
  tableSelectedCellBgColor: "#1e3a8a",
  tableSelectedControlBgColor: "#60a5fa",
  tableResizeHandleBgColor: "#60a5fa",
  tableCellBgColor: "#111827",
  tableHoverBgColor: "#1f2937",

  slashMenuColor: "rgba(255, 255, 255, 0.87)",
  slashMenuTitleColor: "rgba(255, 255, 255, 0.45)",
  slashMenuBoxshadow: "rgb(0 0 0/30%) 0 0 10px",
  slashMenuHoverBgColor: "rgb(255 255 255 / 5%)"
};

export default light;
