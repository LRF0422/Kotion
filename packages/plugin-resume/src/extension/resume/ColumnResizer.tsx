import React from 'react';

interface ColumnResizerProps {
  width: number;
  onWidthChange: (width: number) => void;
}

export function ColumnResizer({ width, onWidthChange }: ColumnResizerProps) {
  const handleDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX;
      const newWidth = Math.max(1, Math.min(3, startWidth + Math.round(diff / 20)));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className="w-4 cursor-col-resize flex items-center justify-center hover:bg-gray-100"
      onMouseDown={handleDrag}
    >
      <div className="h-8 w-1 bg-gray-300 rounded" />
    </div>
  );
}
