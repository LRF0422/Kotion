import React, { useState } from 'react';
import { NodeViewWrapper } from '@kn/editor';
import { Card, Input, Button } from '@kn/ui';
import { Plus, Trash2, ChevronUp, ChevronDown, Edit } from 'lucide-react';
import { BasicInfoBlock, EducationBlock, WorkBlock, SkillBlock, ProjectBlock, AwardBlock, CustomBlock } from '../ResumeBlocks';

export function ResumeNodeView(props: any) {
  const { node, updateAttributes } = props;
  const data = node.attrs.data || { title: '我的简历', blocks: [] };
  const [isEditing, setIsEditing] = useState(false);

  // 添加新块
  const addBlock = (type: string) => {
    const newBlock = {
      id: uuidv4(),
      type,
      data: getDefaultBlockData(type)
    };
    updateAttributes({
      data: {
        ...data,
        blocks: [...data.blocks, newBlock]
      }
    });
  };

  // 更新块数据
  const updateBlock = (blockId: string, blockData: any) => {
    updateAttributes({
      data: {
        ...data,
        blocks: data.blocks.map((b: any) => b.id === blockId ? { ...b, data: { ...b.data, ...blockData } } : b)
      }
    });
  };

  // 删除块
  const removeBlock = (blockId: string) => {
    updateAttributes({
      data: {
        ...data,
        blocks: data.blocks.filter((b: any) => b.id !== blockId)
      }
    });
  };

  // 移动块
  const moveBlock = (blockId: string, direction: 'up' | 'down') => {
    const blocks = [...data.blocks];
    const index = blocks.findIndex((b: any) => b.id === blockId);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= blocks.length) return;

    [blocks[index], blocks[newIndex]] = [blocks[newIndex], blocks[index]];
    updateAttributes({ data: { ...data, blocks } });
  };

  const getBlockTitle = (type: string) => {
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
  };

  const renderBlockContent = (block: any) => {
    const { type, data: blockData, id } = block;

    switch (type) {
      case 'basicInfo':
        return <BasicInfoBlock data={blockData} onChange={(d) => updateBlock(id, d)} />;
      case 'education':
        return <EducationBlock data={blockData} onChange={(d) => updateBlock(id, d)} />;
      case 'work':
        return <WorkBlock data={blockData} onChange={(d) => updateBlock(id, d)} />;
      case 'skill':
        return <SkillBlock data={blockData} onChange={(d) => updateBlock(id, d)} />;
      case 'project':
        return <ProjectBlock data={blockData} onChange={(d) => updateBlock(id, d)} />;
      case 'award':
        return <AwardBlock data={blockData} onChange={(d) => updateBlock(id, d)} />;
      case 'custom':
        return <CustomBlock data={blockData} onChange={(d) => updateBlock(id, d)} />;
      default:
        return null;
    }
  };

  // 显示块选择菜单
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
          <div className="space-y-4">
            <div className="space-y-2">
              {data.blocks.map((block: any, index: number) => (
                <div key={block.id} className="border rounded p-3 relative group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">{getBlockTitle(block.type)}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => moveBlock(block.id, 'up')} disabled={index === 0}>
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => moveBlock(block.id, 'down')} disabled={index === data.blocks.length - 1}>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeBlock(block.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {renderBlockContent(block)}
                </div>
              ))}
            </div>

            <div className="relative">
              <Button variant="outline" onClick={() => setShowBlockPicker(!showBlockPicker)}>
                <Plus className="h-4 w-4 mr-1" />
                添加组件
              </Button>

              {showBlockPicker && (
                <div className="absolute top-full left-0 mt-1 z-10 w-48 bg-background border rounded-lg shadow-lg p-2">
                  {blockTypes.map(bt => (
                    <button
                      key={bt.type}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-accent text-left"
                      onClick={() => {
                        addBlock(bt.type);
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
        ) : (
          <div className="text-sm text-muted-foreground">
            {data.blocks.length === 0 ? (
              <p>点击编辑按钮添加简历内容</p>
            ) : (
              <p>已添加 {data.blocks.length} 个组件块</p>
            )}
          </div>
        )}
      </Card>
    </NodeViewWrapper>
  );
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
