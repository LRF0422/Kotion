import React from "react";

export function MenuBar({
  title,
  onTitleChange,
}: {
  title: string;
  onTitleChange: (title: string) => void;
}) {
  return (
    <div className="logicflow-menubar">
      <input
        value={title}
        aria-label="Diagram title"
        className="h-9 w-48 rounded bg-transparent px-2 text-sm font-medium outline-none hover:bg-accent focus:bg-accent"
        onChange={(event) => onTitleChange(event.target.value)}
      />
    </div>
  );
}
