import React, { useState } from 'react';
import { useResume } from '../hooks/useResume';
import { BlockType, ResumeBlock } from '../types/resume';
import { BlockPicker } from '../components/BlockPicker/BlockPicker';
import {
  BasicInfoBlock,
  EducationBlock,
  WorkBlock,
  SkillBlock,
  ProjectBlock,
  AwardBlock,
  CustomBlock
} from '../components/ResumeBlocks';
import { Button } from '@kn/ui/components/ui/button';
import { Input } from '@kn/ui/components/ui/input';
import { Card } from '@kn/ui/components/ui/card';
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react';

interface ResumeEditorProps {
  initialData?: any;
  onSave?: (data: any) => void;
}

export function ResumeEditor({ initialData, onSave }: ResumeEditorProps) {
  const {
    resume,
    isDirty,
    updateTitle,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
    clearDraft
  } = useResume(initialData);

  const [showBlockPicker, setShowBlockPicker] = useState(false);

  const handleSave = () => {
    onSave?.({ resume });
    clearDraft();
  };

  const renderBlockContent = (block: ResumeBlock) => {
    const commonProps = {
      data: block.data,
      onChange: (data: any) => updateBlock(block.id, data)
    };

    switch (block.type) {
      case 'basicInfo':
        return <BasicInfoBlock {...commonProps} />;
      case 'education':
        return <EducationBlock {...commonProps} />;
      case 'work':
        return <WorkBlock {...commonProps} />;
      case 'skill':
        return <SkillBlock {...commonProps} />;
      case 'project':
        return <ProjectBlock {...commonProps} />;
      case 'award':
        return <AwardBlock {...commonProps} />;
      case 'custom':
        return <CustomBlock {...commonProps} />;
      default:
        return null;
    }
  };

  const getBlockTitle = (type: BlockType) => {
    const titles: Record<BlockType, string> = {
      basicInfo: '基础信息',
      education: '教育经历',
      work: '工作经历',
      skill: '技能',
      project: '项目经验',
      award: '证书奖项',
      custom: '自定义文本'
    };
    return titles[type];
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Input
          value={resume.title}
          onChange={e => updateTitle(e.target.value)}
          className="text-lg font-semibold w-64"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBlockPicker(true)}>
            <Plus className="h-4 w-4 mr-1" />
            添加组件
          </Button>
          <Button onClick={handleSave} disabled={!isDirty}>
            保存
          </Button>
        </div>
      </div>

      {/* Block Picker */}
      {showBlockPicker && (
        <div className="absolute top-16 left-4 z-50">
          <BlockPicker
            onSelect={(type) => addBlock(type)}
            onClose={() => setShowBlockPicker(false)}
          />
        </div>
      )}

      {/* Blocks */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {resume.blocks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>暂无内容</p>
              <p className="text-sm">点击"添加组件"开始创建简历</p>
            </div>
          ) : (
            resume.blocks.map((block, index) => (
              <Card
                key={block.id}
                className="p-4 relative group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-sm text-muted-foreground">
                    {getBlockTitle(block.type)}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveBlock(block.id, 'up')}
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveBlock(block.id, 'down')}
                      disabled={index === resume.blocks.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBlock(block.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {renderBlockContent(block)}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
