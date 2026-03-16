# 简历插件分栏布局实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将简历插件从垂直列表改为多列网格布局，支持2-4列，用户可手动创建列并在每列中添加组件

**Architecture:** 使用 Tiptap Node Extension + ReactNodeViewRenderer，数据存储在 node.attrs.data.columns 中，每列独立管理其内的组件块

**Tech Stack:** React, TypeScript, Tailwind CSS, Tiptap

---

## 文件结构

```
packages/plugin-resume/src/
├── types/resume.ts                    # 更新数据类型定义
├── extension/
│   ├── resume/resume.ts               # 更新 Tiptap Node 默认数据
│   ├── resume/ResumeNodeView.tsx      # 重写为多列布局
│   ├── resume/Column.tsx              # 新建：列组件
│   ├── resume/ColumnResizer.tsx       # 新建：列宽调节器
│   └── ResumeBlocks/                  # 复用现有7个原子组件
└── index.tsx                          # 更新 slashConfig
```

---

## Chunk 1: 数据类型和基础结构

### Task 1: 更新类型定义

**Files:**
- Modify: `packages/plugin-resume/src/types/resume.ts`

- [ ] **Step 1: 更新 ResumeData 和 Column 类型**

打开文件，添加 Column 类型定义：

```typescript
export interface ResumeData {
  id: string;
  title: string;
  columns: Column[];
}

export interface Column {
  id: string;
  width: number;  // 宽度权重 1-3
  blocks: ResumeBlock[];
}

export interface ResumeBlock {
  id: string;
  type: BlockType;
  data: BasicInfoData | EducationData | WorkData | SkillData | ProjectData | AwardData | CustomData;
}
```

- [ ] **Step 2: 更新 createDefaultResumeData 函数**

```typescript
function createDefaultResumeData(): ResumeData {
  return {
    id: uuidv4(),
    title: '我的简历',
    columns: [
      { id: uuidv4(), width: 1, blocks: [] },
      { id: uuidv4(), width: 1, blocks: [] }
    ]
  };
}
```

- [ ] **Step 3: 提交更改**

```bash
git add packages/plugin-resume/src/types/resume.ts
git commit -m "feat(resume): add column layout data types

- Add Column interface with width weight
- Add ResumeBlock interface
- Update createDefaultResumeData to create 2 columns by default

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 创建 Column 组件

**Files:**
- Create: `packages/plugin-resume/src/extension/resume/Column.tsx`

- [ ] **Step 1: 创建 Column 组件**

```tsx
import React, { useState } from 'react';
import { Card, Button } from '@kn/ui';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { ResumeBlock as ResumeBlockType } from '../../types/resume';
import { BasicInfoBlock, EducationBlock, WorkBlock, SkillBlock, ProjectBlock, AwardBlock, CustomBlock } from '../ResumeBlocks';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ColumnProps {
  column: Column;
  columnIndex: number;
  totalColumns: number;
  onAddBlock: (type: string) => void;
  onRemoveBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: 'up' | 'down') => void;
  onUpdateBlock: (blockId: string, data: any) => void;
  onDeleteColumn: () => void;
}

export function Column({ column, columnIndex, totalColumns, onAddBlock, onRemoveBlock, onMoveBlock, onUpdateBlock, onDeleteColumn }: ColumnProps) {
  const [showBlockPicker, setShowBlockPicker] = useState(false);

  const blockTypes = [
    { type: 'basicInfo', label: '基础信息', icon: '👤' },
    { type: 'education', label: '教育经历', icon: '🎓' },
    { type: 'work', label: '工作经历', icon: '💼' },
    { type: 'skill', label: '技能', icon: '⚡' },
    { type: 'project', label: '项目经验', icon: '📁' },
    { type: 'award', label: '证书奖项', icon: '🏆' },
    { type: 'custom', label: '自定义文本', icon: '📝' }
  ];

  const renderBlockContent = (block: ResumeBlockType) => {
    const { type, data, id } = block;
    switch (type) {
      case 'basicInfo':
        return <BasicInfoBlock data={data} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'education':
        return <EducationBlock data={data} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'work':
        return <WorkBlock data={data} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'skill':
        return <SkillBlock data={data} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'project':
        return <ProjectBlock data={data} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'award':
        return <AwardBlock data={data} onChange={(d) => onUpdateBlock(id, d)} />;
      case 'custom':
        return <CustomBlock data={data} onChange={(d) => onUpdateBlock(id, d)} />;
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
```

- [ ] **Step 2: 提交更改**

```bash
git add packages/plugin-resume/src/extension/resume/Column.tsx
git commit -m "feat(resume): add Column component

- Create Column component with block management
- Add block picker dropdown
- Support block move up/down and delete

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: 主视图和列宽调节

### Task 3: 创建列宽调节器组件

**Files:**
- Create: `packages/plugin-resume/src/extension/resume/ColumnResizer.tsx`

- [ ] **Step 1: 创建 ColumnResizer 组件**

```tsx
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
      // 简单实现：每10px变化1个权重
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
```

- [ ] **Step 2: 提交更改**

```bash
git add packages/plugin-resume/src/extension/resume/ColumnResizer.tsx
git commit -m "feat(resume): add ColumnResizer component

- Drag to adjust column width
- Width range: 1-3 (weight)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 重写 ResumeNodeView 为多列布局

**Files:**
- Modify: `packages/plugin-resume/src/extension/resume/ResumeNodeView.tsx`

- [ ] **Step 1: 重写 ResumeNodeView**

用新的多列布局代码替换整个文件：

```tsx
import React, { useState } from 'react';
import { NodeViewWrapper } from '@kn/editor';
import { Card, Button } from '@kn/ui';
import { Plus, Edit, Columns } from 'lucide-react';
import { Column } from './Column';
import { ColumnResizer } from './ColumnResizer';
import { ResumeData, Column as ColumnType, ResumeBlock as ResumeBlockType, BlockType } from '../../types/resume';

export function ResumeNodeView(props: any) {
  const { node, updateAttributes } = props;
  const data: ResumeData = node.attrs.data || createDefaultData();
  const [isEditing, setIsEditing] = useState(false);

  // 添加列
  const addColumn = () => {
    if (data.columns.length >= 4) return;
    const newColumns = [
      ...data.columns,
      { id: uuidv4(), width: 1, blocks: [] }
    ];
    updateAttributes({ data: { ...data, columns: newColumns } });
  };

  // 删除列
  const deleteColumn = (columnId: string) => {
    const newColumns = data.columns.filter((c: ColumnType) => c.id !== columnId);
    updateAttributes({ data: { ...data, columns: newColumns } });
  };

  // 添加块到指定列
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

  // 删除块
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

  // 移动块
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

  // 更新块数据
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

  // 调整列宽
  const updateColumnWidth = (columnId: string, width: number) => {
    const newColumns = data.columns.map((col: ColumnType) =>
      col.id === columnId ? { ...col, width } : col
    );
    updateAttributes({ data: { ...data, columns: newColumns } });
  };

  // 计算列宽度样式
  const getColumnWidthStyle = () => {
    const totalWeight = data.columns.reduce((sum: number, col: ColumnType) => sum + col.width, 0);
    return data.columns.map((col: ColumnType) => ({
      flex: col.width,
      minWidth: `${(col.width / totalWeight) * 100}%`
    }));
  };

  const columnStyles = getColumnWidthStyle();

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
            {/* 工具栏 */}
            <div className="flex items-center gap-2 pb-2 border-b">
              <Button variant="outline" size="sm" onClick={addColumn} disabled={data.columns.length >= 4}>
                <Plus className="h-3 w-3 mr-1" />
                添加列
              </Button>
              <span className="text-xs text-muted-foreground">
                {data.columns.length}/4 列
              </span>
            </div>

            {/* 多列网格 */}
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
```

- [ ] **Step 2: 构建验证**

```bash
cd /home/Leong/Desktop/knowledge-repo
pnpm --filter @kn/resume-plugin build
```

预期：构建成功，无 TypeScript 错误

- [ ] **Step 3: 提交更改**

```bash
git add packages/plugin-resume/src/extension/resume/ResumeNodeView.tsx
git commit -m "feat(resume): rewrite ResumeNodeView for column layout

- Multi-column grid layout (2-4 columns)
- Column add/delete support
- Block management within columns
- Column width adjustment via drag

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: 更新插件入口

### Task 5: 更新 index.tsx

**Files:**
- Modify: `packages/plugin-resume/src/index.tsx`

- [ ] **Step 1: 更新 slashConfig**

更新 slashConfig，为每个组件块类型添加单独的 slash 命令：

```typescript
import { KPlugin, PluginConfig, ExtensionWrapper } from '@kn/common';
import { ResumeExtension } from './extension';

interface ResumePluginConfig extends PluginConfig {}

class ResumePlugin extends KPlugin<ResumePluginConfig> {}

const blockTypes = [
  { type: 'basicInfo', label: '基础信息', slash: '/基础信息' },
  { type: 'education', label: '教育经历', slash: '/教育' },
  { type: 'work', label: '工作经历', slash: '/工作' },
  { type: 'skill', label: '技能', slash: '/技能' },
  { type: 'project', label: '项目经验', slash: '/项目' },
  { type: 'award', label: '证书奖项', slash: '/奖项' },
  { type: 'custom', label: '自定义文本', slash: '/文本' }
];

export const resume = new ResumePlugin({
  name: 'Resume',
  status: 'ACTIVE',
  editorExtension: [{
    name: 'resume',
    extendsion: [ResumeExtension],
    slashConfig: [
      {
        text: '简历',
        slash: '/resume',
        action: (editor) => {
          editor.chain().focus().insertResume().run();
        }
      },
      ...blockTypes.map(bt => ({
        text: bt.label,
        slash: bt.slash,
        action: (editor) => {
          // 找到当前激活的简历块，添加到第一列
          editor.chain().focus().addResumeBlock(bt.type).run();
        }
      }))
    ]
  }] as ExtensionWrapper[]
});
```

- [ ] **Step 2: 添加 addResumeBlock 命令**

修改 resume.ts 添加新命令：

```typescript
addCommands() {
  return {
    insertResume: (data?: any) => ({ commands }: any) => {
      return commands.insertContent({
        type: this.name,
        attrs: {
          data: data || createDefaultResumeData()
        }
      });
    },
    addResumeBlock: (type: string) => ({ tr, state, dispatch }: any) => {
      const { selection } = state;
      const node = selection.$anchor.node;

      // 如果当前在简历块内，添加到第一列
      if (node && node.type.name === 'resume' && dispatch) {
        const data = node.attrs.data || createDefaultResumeData();
        if (data.columns.length > 0) {
          const newBlock = {
            id: uuidv4(),
            type,
            data: getDefaultBlockData(type)
          };
          const newColumns = [...data.columns];
          newColumns[0] = {
            ...newColumns[0],
            blocks: [...newColumns[0].blocks, newBlock]
          };
          dispatch(tr.setNodeMarkup(selection.$anchor.pos, undefined, {
            ...node.attrs,
            data: { ...data, columns: newColumns }
          }));
          return true;
        }
      }
      return false;
    }
  };
}
```

- [ ] **Step 3: 构建验证**

```bash
pnpm --filter @kn/resume-plugin build
```

预期：构建成功

- [ ] **Step 4: 提交更改**

```bash
git add packages/plugin-resume/src/index.tsx packages/plugin-resume/src/extension/resume/resume.ts
git commit -m "feat(resume): add slash commands for each block type

- Add /基础信息, /教育, /工作, /技能, /项目, /奖项, /文本
- Add addResumeBlock command to add blocks via slash menu

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: 数据迁移

### Task 6: 兼容旧数据

**Files:**
- Modify: `packages/plugin-resume/src/extension/resume/resume.ts`

- [ ] **Step 1: 添加数据迁移逻辑**

在 createDefaultResumeData 或 ResumeNodeView 中添加旧数据检测：

```typescript
function migrateToColumnLayout(data: any): ResumeData {
  // 如果已经是 columns 格式，直接返回
  if (data.columns && Array.isArray(data.columns)) {
    return data;
  }

  // 旧格式：直接是 blocks 数组
  // 迁移到 2 列布局
  const midpoint = Math.ceil((data.blocks || []).length / 2);
  return {
    id: data.id || uuidv4(),
    title: data.title || '我的简历',
    columns: [
      { id: uuidv4(), width: 1, blocks: (data.blocks || []).slice(0, midpoint) },
      { id: uuidv4(), width: 1, blocks: (data.blocks || []).slice(midpoint) }
    ]
  };
}
```

在 ResumeNodeView 中使用：

```typescript
const data: ResumeData = migrateToColumnLayout(node.attrs.data || {
  id: uuidv4(),
  title: '我的简历',
  columns: [
    { id: uuidv4(), width: 1, blocks: [] },
    { id: uuidv4(), width: 1, blocks: [] }
  ]
});
```

- [ ] **Step 2: 提交更改**

```bash
git add packages/plugin-resume/src/extension/resume/resume.ts
git commit -m "feat(resume): add backward compatibility for old data

- Auto-migrate blocks array to column layout
- Support viewing old resume data

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 总结

完成所有任务后，简历插件将支持：

1. ✅ 多列网格布局（2-4列）
2. ✅ 手动添加/删除列
3. ✅ 列宽拖拽调节
4. ✅ 每列内独立添加/编辑/删除组件块
5. ✅ 组件块在列内上移/下移
6. ✅ 7种组件块的 slash 命令
7. ✅ 旧数据自动迁移

构建并测试后即可使用。
