import React from 'react';
import { BlockType, blockTypeLabels } from '../../types/resume';

interface BlockPickerProps {
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

const blockTypes: BlockType[] = ['basicInfo', 'education', 'work', 'skill', 'project', 'award', 'custom'];

const blockIcons: Record<BlockType, string> = {
  basicInfo: '👤',
  education: '🎓',
  work: '💼',
  skill: '⚡',
  project: '📁',
  award: '🏆',
  custom: '📝'
};

export function BlockPicker({ onSelect, onClose }: BlockPickerProps) {
  return (
    <div className="absolute z-50 w-64 bg-background border rounded-lg shadow-lg p-2">
      <div className="text-sm font-medium text-muted-foreground px-2 py-1">
        添加组件
      </div>
      <div className="space-y-1">
        {blockTypes.map(type => (
          <button
            key={type}
            className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-accent text-left"
            onClick={() => {
              onSelect(type);
              onClose();
            }}
          >
            <span>{blockIcons[type]}</span>
            <span>{blockTypeLabels[type]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
