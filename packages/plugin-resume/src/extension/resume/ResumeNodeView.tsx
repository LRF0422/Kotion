import React, { useState } from 'react';
import { NodeViewWrapper } from '@kn/editor';
import { Card, Button } from '@kn/ui';
import { Plus, Edit } from 'lucide-react';
import { Column } from './Column';
import { ColumnResizer } from './ColumnResizer';
import { ResumeData, Column as ColumnType, ResumeBlock as ResumeBlockType, BlockType } from '../../types/resume';

export function ResumeNodeView(props: any) {
  const { node, updateAttributes } = props;
  const data: ResumeData = node.attrs.data || createDefaultData();
  const [isEditing, setIsEditing] = useState(false);

  const addColumn = () => {
    if (data.columns.length >= 4) return;
    const newColumns = [
      ...data.columns,
      { id: uuidv4(), width: 1, blocks: [] }
    ];
    updateAttributes({ data: { ...data, columns: newColumns } });
  };

  const deleteColumn = (columnId: string) => {
    const newColumns = data.columns.filter((c: ColumnType) => c.id !== columnId);
    updateAttributes({ data: { ...data, columns: newColumns } });
  };

  const addBlock = (columnId: string, type: BlockType) => {
    const newColumns = data.columns.map((col: ColumnType) => {
      if (col.id === columnId) {
        return {
          ...col,
          blocks: [...col.blocks, {
            id: uuidv4(),
            type,
            data: getDefaultBlockData(type)
          }]
        };
      }
      return col;
    });
    updateAttributes({ data: { ...data, columns: newColumns } });
  };

  const removeBlock = (columnId: string, blockId: string) => {
    const newColumns = data.columns.map((col: ColumnType) => {
      if (col.id === columnId) {
        return {
          ...col,
          blocks: col.blocks.filter((b: ResumeBlockType) => b.id !== blockId)
        };
      }
      return col;
    });
    updateAttributes({ data: { ...data, columns: newColumns } });
  };

  const moveBlock = (columnId: string, blockId: string, direction: 'up' | 'down') => {
    const newColumns = data.columns.map((col: ColumnType) => {
      if (col.id === columnId) {
        const blocks = [...col.blocks];
        const index = blocks.findIndex((b: ResumeBlockType) => b.id === blockId);
        if (index === -1) return col;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= blocks.length) return col;

        [blocks[index], blocks[newIndex]] = [blocks[newIndex], blocks[index]];
        return { ...col, blocks };
      }
      return col;
    });
    updateAttributes({ data: { ...data, columns: newColumns } });
  };

  const updateBlock = (columnId: string, blockId: string, blockData: any) => {
    const newColumns = data.columns.map((col: ColumnType) => {
      if (col.id === columnId) {
        return {
          ...col,
          blocks: col.blocks.map((b: ResumeBlockType) =>
            b.id === blockId ? { ...b, data: { ...b.data, ...blockData } } : b
          )
        };
      }
      return col;
    });
    updateAttributes({ data: { ...data, columns: newColumns } });
  };

  const updateColumnWidth = (columnId: string, width: number) => {
    const newColumns = data.columns.map((col: ColumnType) =>
      col.id === columnId ? { ...col, width } : col
    );
    updateAttributes({ data: { ...data, columns: newColumns } });
  };

  return (
    <NodeViewWrapper>
      <Card className="p-4 my-2">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium">{data.title || '简历'}</span>
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(!isEditing)}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>

        {isEditing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Button variant="outline" size="sm" onClick={addColumn} disabled={data.columns.length >= 4}>
                <Plus className="h-3 w-3 mr-1" />
                添加列
              </Button>
              <span className="text-xs text-muted-foreground">
                {data.columns.length}/4 列
              </span>
            </div>

            <div className="flex gap-2">
              {data.columns.map((column: ColumnType, index: number) => (
                <React.Fragment key={column.id}>
                  <div style={{ flex: column.width }} className="min-w-0">
                    <Column
                      column={column}
                      columnIndex={index}
                      totalColumns={data.columns.length}
                      onAddBlock={(type) => addBlock(column.id, type)}
                      onRemoveBlock={(blockId) => removeBlock(column.id, blockId)}
                      onMoveBlock={(blockId, direction) => moveBlock(column.id, blockId, direction)}
                      onUpdateBlock={(blockId, data) => updateBlock(column.id, blockId, data)}
                      onDeleteColumn={() => deleteColumn(column.id)}
                    />
                  </div>
                  {index < data.columns.length - 1 && (
                    <ColumnResizer
                      width={column.width}
                      onWidthChange={(w) => updateColumnWidth(column.id, w)}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {getTotalBlocks(data) === 0 ? (
              <p>点击编辑按钮添加简历内容</p>
            ) : (
              <p>已添加 {data.columns.length} 列，{getTotalBlocks(data)} 个组件块</p>
            )}
          </div>
        )}
      </Card>
    </NodeViewWrapper>
  );
}

function createDefaultData(): ResumeData {
  return {
    id: uuidv4(),
    title: '我的简历',
    columns: [
      { id: uuidv4(), width: 1, blocks: [] },
      { id: uuidv4(), width: 1, blocks: [] }
    ]
  };
}

function getTotalBlocks(data: ResumeData): number {
  return data.columns.reduce((sum, col) => sum + col.blocks.length, 0);
}

function getDefaultBlockData(type: string): any {
  switch (type) {
    case 'basicInfo':
      return { name: '', email: '', phone: '' };
    case 'education':
      return { id: uuidv4(), school: '', degree: '', major: '', startDate: '', endDate: '', isOngoing: false };
    case 'work':
      return { id: uuidv4(), company: '', position: '', startDate: '', endDate: '', isOngoing: false };
    case 'skill':
      return { id: uuidv4(), name: '', level: 'familiar' };
    case 'project':
      return { id: uuidv4(), name: '', time: '', role: '' };
    case 'award':
      return { id: uuidv4(), name: '', issuer: '', date: '' };
    case 'custom':
      return { content: '', style: 'normal' };
    default:
      return {};
  }
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
