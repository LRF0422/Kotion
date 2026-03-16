import React, { useState } from 'react';
import { Button } from '@kn/ui';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Column as ColumnType, ResumeBlock, BlockType } from '../../types/resume';
import { BasicInfoBlock, EducationBlock, WorkBlock, SkillBlock, ProjectBlock, AwardBlock, CustomBlock } from '../ResumeBlocks';

interface ColumnProps {
  column: ColumnType;
  columnIndex: number;
  totalColumns: number;
  onAddBlock: (type: BlockType) => void;
  onRemoveBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: 'up' | 'down') => void;
  onUpdateBlock: (blockId: string, data: any) => void;
  onDeleteColumn: () => void;
}

export function Column({ column, columnIndex, totalColumns, onAddBlock, onRemoveBlock, onMoveBlock, onUpdateBlock, onDeleteColumn }: ColumnProps) {
  const [showBlockPicker, setShowBlockPicker] = useState(false);

  const blockTypes: { type: BlockType; label: string; icon: string }[] = [
    { type: 'basicInfo', label: '基础信息', icon: '👤' },
    { type: 'education', label: '教育经历', icon: '🎓' },
    { type: 'work', label: '工作经历', icon: '💼' },
    { type: 'skill', label: '技能', icon: '⚡' },
    { type: 'project', label: '项目经验', icon: '📁' },
    { type: 'award', label: '证书奖项', icon: '🏆' },
    { type: 'custom', label: '自定义文本', icon: '📝' }
  ];

  const renderBlockContent = (block: ResumeBlock) => {
    const { type, data, id } = block;
    switch (type) {
      case 'basicInfo':
        return <BasicInfoBlock data={data as any} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'education':
        return <EducationBlock data={data as any} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'work':
        return <WorkBlock data={data as any} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'skill':
        return <SkillBlock data={data as any} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'project':
        return <ProjectBlock data={data as any} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'award':
        return <AwardBlock data={data as any} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'custom':
        return <CustomBlock data={data as any} onChange={(d) => onUpdateBlock(id, d)} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-[200px] border border-dashed border-gray-300 rounded-lg p-2 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-medium">列 {columnIndex + 1}</span>
        {totalColumns > 2 && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDeleteColumn}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-2">
        {column.blocks.map((block, index) => (
          <div key={block.id} className="bg-white border rounded p-2 relative group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{getBlockTitle(block.type)}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onMoveBlock(block.id, 'up')} disabled={index === 0}>
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onMoveBlock(block.id, 'down')} disabled={index === column.blocks.length - 1}>
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onRemoveBlock(block.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {renderBlockContent(block)}
          </div>
        ))}
      </div>

      {column.blocks.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          点击添加组件
        </div>
      )}

      <div className="relative mt-2">
        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowBlockPicker(!showBlockPicker)}>
          <Plus className="h-3 w-3 mr-1" />
          添加组件
        </Button>
        {showBlockPicker && (
          <div className="absolute bottom-full left-0 mb-1 w-full bg-background border rounded-lg shadow-lg p-1">
            {blockTypes.map(bt => (
              <button
                key={bt.type}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-left text-sm"
                onClick={() => {
                  onAddBlock(bt.type);
                  setShowBlockPicker(false);
                }}
              >
                <span>{bt.icon}</span>
                <span>{bt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getBlockTitle(type: string) {
  const titles: Record<string, string> = {
    basicInfo: '基础信息',
    education: '教育经历',
    work: '工作经历',
    skill: '技能',
    project: '项目经验',
    award: '证书奖项',
    custom: '自定义文本'
  };
  return titles[type] || type;
}
