import { Loader2 } from "@repo/icon";
import React from "react";

const LoadingWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column"
};

export const Loading = ({ text }: { text?: string }) => {
  return (
    <div style={LoadingWrapStyle}>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      <p style={{ marginTop: "1em" }}>{text}</p>
    </div>
  );
};
