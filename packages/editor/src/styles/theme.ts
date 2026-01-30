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

  // Light mode table colors - Modern clean design
  tableBorderColor: "#e2e8f0",
  tableHeaderBgColor: "#f8fafc",
  tableHeaderTextColor: "#475569",
  tableSelectedBorderColor: "#3b82f6",
  tableSelectedCellBgColor: "rgba(59, 130, 246, 0.08)",
  tableSelectedControlBgColor: "#3b82f6",
  tableResizeHandleBgColor: "#3b82f6",
  tableCellBgColor: "transparent",
  tableHoverBgColor: "#f8fafc",
  tableGripBgColor: "#f1f5f9",
  tableGripHoverBgColor: "#e2e8f0",
  tableGripDotColor: "#94a3b8",

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

  // Dark mode table colors - Modern clean design
  tableBorderColor: "#334155",
  tableHeaderBgColor: "#1e293b",
  tableHeaderTextColor: "#94a3b8",
  tableSelectedBorderColor: "#60a5fa",
  tableSelectedCellBgColor: "rgba(96, 165, 250, 0.12)",
  tableSelectedControlBgColor: "#60a5fa",
  tableResizeHandleBgColor: "#60a5fa",
  tableCellBgColor: "transparent",
  tableHoverBgColor: "#1e293b",
  tableGripBgColor: "#1e293b",
  tableGripHoverBgColor: "#334155",
  tableGripDotColor: "#64748b",

  slashMenuColor: "rgba(255, 255, 255, 0.87)",
  slashMenuTitleColor: "rgba(255, 255, 255, 0.45)",
  slashMenuBoxshadow: "rgb(0 0 0/30%) 0 0 10px",
  slashMenuHoverBgColor: "rgb(255 255 255 / 5%)"
};

export default light;
