# 简历插件实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建简历插件，提供简历原子组件，用户通过 / 命令或 + 按钮添加组件块，所见即所得编辑

**Architecture:** 基于现有插件架构，创建独立插件包 `plugin-resume`，使用 Tiptap 编辑器扩展实现块管理，通过 JSON 格式存储到知识库页面

**Tech Stack:** React 18, TypeScript, Tiptap, shadcn/ui, Tailwind CSS

---

## Chunk 1: 插件基础架构

### Task 1: 创建插件包基础结构

**Files:**
- Create: `packages/plugin-resume/package.json`
- Create: `packages/plugin-resume/tsconfig.json`
- Create: `packages/plugin-resume/tailwind.config.js`
- Create: `packages/plugin-resume/postcss.config.js`
- Create: `packages/plugin-resume/rollup.config.mjs`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@kn/resume-plugin",
  "version": "0.0.1",
  "description": "简历插件 - 提供简历原子组件",
  "main": "src/index.tsx",
  "publishConfig": {
    "main": "dist/index.js",
    "types": "dist/index.d.ts"
  },
  "scripts": {
    "build": "rollup -c"
  },
  "dependencies": {
    "@kn/common": "workspace:*",
    "@kn/core": "workspace:*",
    "@kn/editor": "workspace:*",
    "@kn/icon": "workspace:*",
    "@kn/ui": "workspace:*"
  },
  "devDependencies": {
    "@kn/rollup-config": "workspace:*"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "@kn/typescript-config/react.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = require('@kn/ui/tailwind.config')
```

- [ ] **Step 4: Create postcss.config.js**

```javascript
module.exports = require('@kn/ui/postcss.config')
```

- [ ] **Step 5: Create rollup.config.mjs**

```javascript
import baseConfig from '@kn/rollup-config'
export default baseConfig
```

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-resume/
git commit -m "feat(resume): add plugin skeleton

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 创建类型定义

**Files:**
- Create: `packages/plugin-resume/src/types/resume.ts`

- [ ] **Step 1: Create types/resume.ts**

```typescript
// 简历元数据
export interface ResumeData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  blocks: ResumeBlock[];
}

// 组件块
export interface ResumeBlock {
  id: string;
  type: BlockType;
  data: BlockData;
  order: number;
}

export type BlockType = 'basicInfo' | 'education' | 'work' | 'skill' | 'project' | 'award' | 'custom';

export type BlockData = BasicInfoData | EducationData | WorkData | SkillData | ProjectData | AwardData | CustomData;

// 基础信息
export interface BasicInfoData {
  name: string;
  email: string;
  phone: string;
  address?: string;
  avatar?: string;
  summary?: string;
}

// 教育经历
export interface EducationData {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;
  description?: string;
}

// 工作经历
export interface WorkData {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;
  description?: string;
}

// 技能
export interface SkillData {
  id: string;
  name: string;
  level: 'beginner' | 'familiar' | 'expert';
  category?: string;
}

// 项目经验
export interface ProjectData {
  id: string;
  name: string;
  time: string;
  role: string;
  techStack?: string[];
  description?: string;
}

// 证书奖项
export interface AwardData {
  id: string;
  name: string;
  issuer: string;
  date: string;
  description?: string;
}

// 自定义文本
export interface CustomData {
  content: string;
  style?: 'normal' | 'heading' | 'quote';
}

// 风格配置
export interface StyleConfig {
  theme: 'blue' | 'green' | 'purple' | 'dark' | 'light';
  titleFont: string;
  bodyFont: string;
  layout: 'single' | 'double' | 'triple';
  spacing: 'compact' | 'normal' | 'loose';
}

// 默认风格配置
export const defaultStyleConfig: StyleConfig = {
  theme: 'blue',
  titleFont: 'Inter',
  bodyFont: 'Inter',
  layout: 'single',
  spacing: 'normal'
};

// Block 类型显示名称
export const blockTypeLabels: Record<BlockType, string> = {
  basicInfo: '基础信息',
  education: '教育经历',
  work: '工作经历',
  skill: '技能',
  project: '项目经验',
  award: '证书奖项',
  custom: '自定义文本'
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-resume/src/types/resume.ts
git commit -m "feat(resume): add type definitions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 创建 useResume Hook

**Files:**
- Create: `packages/plugin-resume/src/hooks/useResume.ts`

- [ ] **Step 1: Create useResume.ts**

```typescript
import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ResumeData, ResumeBlock, BlockType, defaultStyleConfig, StyleConfig } from '../types/resume';

const STORAGE_KEY = 'resume_draft';

function createEmptyResume(): ResumeData {
  return {
    id: uuidv4(),
    title: '我的简历',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    blocks: []
  };
}

export function useResume(initialData?: ResumeData) {
  const [resume, setResume] = useState<ResumeData>(initialData || createEmptyResume());
  const [style, setStyle] = useState<StyleConfig>(defaultStyleConfig);
  const [isDirty, setIsDirty] = useState(false);

  // 从 localStorage 恢复草稿
  useEffect(() => {
    if (!initialData) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setResume(parsed.resume);
          setStyle(parsed.style || defaultStyleConfig);
        } catch (e) {
          console.error('Failed to load draft:', e);
        }
      }
    }
  }, [initialData]);

  // 自动保存到 localStorage
  useEffect(() => {
    if (isDirty) {
      const timer = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ resume, style }));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resume, style, isDirty]);

  const updateTitle = useCallback((title: string) => {
    setResume(prev => ({ ...prev, title, updatedAt: new Date().toISOString() }));
    setIsDirty(true);
  }, []);

  const addBlock = useCallback((type: BlockType) => {
    const newBlock: ResumeBlock = {
      id: uuidv4(),
      type,
      data: getDefaultBlockData(type),
      order: resume.blocks.length
    };
    setResume(prev => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
      updatedAt: new Date().toISOString()
    }));
    setIsDirty(true);
    return newBlock.id;
  }, [resume.blocks.length]);

  const updateBlock = useCallback((id: string, data: Partial<BlockData>) => {
    setResume(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => b.id === id ? { ...b, data: { ...b.data, ...data } } : b),
      updatedAt: new Date().toISOString()
    }));
    setIsDirty(true);
  }, []);

  const removeBlock = useCallback((id: string) => {
    setResume(prev => ({
      ...prev,
      blocks: prev.blocks.filter(b => b.id !== id).map((b, i) => ({ ...b, order: i })),
      updatedAt: new Date().toISOString()
    }));
    setIsDirty(true);
  }, []);

  const moveBlock = useCallback((id: string, direction: 'up' | 'down') => {
    setResume(prev => {
      const blocks = [...prev.blocks];
      const index = blocks.findIndex(b => b.id === id);
      if (index === -1) return prev;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= blocks.length) return prev;

      [blocks[index], blocks[newIndex]] = [blocks[newIndex], blocks[index]];
      return {
        ...prev,
        blocks: blocks.map((b, i) => ({ ...b, order: i })),
        updatedAt: new Date().toISOString()
      };
    });
    setIsDirty(true);
  }, []);

  const updateStyle = useCallback((newStyle: Partial<StyleConfig>) => {
    setStyle(prev => ({ ...prev, ...newStyle }));
    setIsDirty(true);
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsDirty(false);
  }, []);

  return {
    resume,
    style,
    isDirty,
    updateTitle,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
    updateStyle,
    clearDraft
  };
}

function getDefaultBlockData(type: BlockType): BlockData {
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
```

- [ ] **Step 2: Add uuid dependency to package.json**

```json
{
  "dependencies": {
    "uuid": "^9.0.0"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/plugin-resume/src/hooks/useResume.ts packages/plugin-resume/package.json
git commit -m "feat(resume): add useResume hook

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: 原子组件块

### Task 4: 创建基础信息块组件

**Files:**
- Create: `packages/plugin-resume/src/components/ResumeBlocks/BasicInfoBlock.tsx`

- [ ] **Step 1: Create BasicInfoBlock.tsx**

```typescript
import React from 'react';
import { BasicInfoData } from '../../types/resume';
import { Input } from '@kn/ui/components/ui/input';
import { Textarea } from '@kn/ui/components/ui/textarea';

interface BasicInfoBlockProps {
  data: BasicInfoData;
  onChange: (data: Partial<BasicInfoData>) => void;
}

export function BasicInfoBlock({ data, onChange }: BasicInfoBlockProps) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 items-start">
        {data.avatar && (
          <img src={data.avatar} alt="avatar" className="w-16 h-16 rounded-full object-cover" />
        )}
        <div className="flex-1 grid grid-cols-2 gap-3">
          <Input
            placeholder="姓名"
            value={data.name}
            onChange={e => onChange({ name: e.target.value })}
          />
          <Input
            placeholder="职位"
            value={data.summary}
            onChange={e => onChange({ summary: e.target.value })}
          />
          <Input
            placeholder="邮箱"
            type="email"
            value={data.email}
            onChange={e => onChange({ email: e.target.value })}
          />
          <Input
            placeholder="手机"
            value={data.phone}
            onChange={e => onChange({ phone: e.target.value })}
          />
          <Input
            placeholder="地址"
            className="col-span-2"
            value={data.address}
            onChange={e => onChange({ address: e.target.value })}
          />
        </div>
      </div>
      <Textarea
        placeholder="个人简介"
        value={data.summary}
        onChange={e => onChange({ summary: e.target.value })}
        rows={3}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-resume/src/components/ResumeBlocks/BasicInfoBlock.tsx
git commit -m "feat(resume): add BasicInfoBlock component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 创建其他原子组件块

**Files:**
- Create: `packages/plugin-resume/src/components/ResumeBlocks/EducationBlock.tsx`
- Create: `packages/plugin-resume/src/components/ResumeBlocks/WorkBlock.tsx`
- Create: `packages/plugin-resume/src/components/ResumeBlocks/SkillBlock.tsx`
- Create: `packages/plugin-resume/src/components/ResumeBlocks/ProjectBlock.tsx`
- Create: `packages/plugin-resume/src/components/ResumeBlocks/AwardBlock.tsx`
- Create: `packages/plugin-resume/src/components/ResumeBlocks/CustomBlock.tsx`
- Create: `packages/plugin-resume/src/components/ResumeBlocks/index.ts`

- [ ] **Step 1: Create EducationBlock.tsx**

```typescript
import React from 'react';
import { EducationData } from '../../types/resume';
import { Input } from '@kn/ui/components/ui/input';
import { Textarea } from '@kn/ui/components/ui/textarea';
import { Checkbox } from '@kn/ui/components/ui/checkbox';

interface EducationBlockProps {
  data: EducationData;
  onChange: (data: Partial<EducationData>) => void;
}

export function EducationBlock({ data, onChange }: EducationBlockProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input
          placeholder="学校"
          value={data.school}
          onChange={e => onChange({ school: e.target.value })}
        />
        <Input
          placeholder="学位"
          value={data.degree}
          onChange={e => onChange({ degree: e.target.value })}
        />
        <Input
          placeholder="专业"
          value={data.major}
          onChange={e => onChange({ major: e.target.value })}
        />
        <div className="flex gap-2">
          <Input
            placeholder="开始时间"
            value={data.startDate}
            onChange={e => onChange({ startDate: e.target.value })}
          />
          {!data.isOngoing && (
            <Input
              placeholder="结束时间"
              value={data.endDate || ''}
              onChange={e => onChange({ endDate: e.target.value })}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={data.isOngoing}
          onCheckedChange={checked => onChange({ isOngoing: checked as boolean })}
        />
        <span className="text-sm text-muted-foreground">进行中</span>
      </div>
      <Textarea
        placeholder="描述"
        value={data.description}
        onChange={e => onChange({ description: e.target.value })}
        rows={2}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create WorkBlock.tsx**

```typescript
import React from 'react';
import { WorkData } from '../../types/resume';
import { Input } from '@kn/ui/components/ui/input';
import { Textarea } from '@kn/ui/components/ui/textarea';
import { Checkbox } from '@kn/ui/components/ui/checkbox';

interface WorkBlockProps {
  data: WorkData;
  onChange: (data: Partial<WorkData>) => void;
}

export function WorkBlock({ data, onChange }: WorkBlockProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input
          placeholder="公司名称"
          value={data.company}
          onChange={e => onChange({ company: e.target.value })}
        />
        <Input
          placeholder="职位"
          value={data.position}
          onChange={e => onChange({ position: e.target.value })}
        />
        <div className="flex gap-2">
          <Input
            placeholder="开始时间"
            value={data.startDate}
            onChange={e => onChange({ startDate: e.target.value })}
          />
          {!data.isOngoing && (
            <Input
              placeholder="结束时间"
              value={data.endDate || ''}
              onChange={e => onChange({ endDate: e.target.value })}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={data.isOngoing}
          onCheckedChange={checked => onChange({ isOngoing: checked as boolean })}
        />
        <span className="text-sm text-muted-foreground">目前在职</span>
      </div>
      <Textarea
        placeholder="工作描述"
        value={data.description}
        onChange={e => onChange({ description: e.target.value })}
        rows={3}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create SkillBlock.tsx**

```typescript
import React from 'react';
import { SkillData } from '../../types/resume';
import { Input } from '@kn/ui/components/ui/input';
import { Select } from '@kn/ui/components/ui/select';

interface SkillBlockProps {
  data: SkillData;
  onChange: (data: Partial<SkillData>) => void;
}

export function SkillBlock({ data, onChange }: SkillBlockProps) {
  return (
    <div className="flex gap-3 items-center">
      <Input
        placeholder="技能名称"
        value={data.name}
        onChange={e => onChange({ name: e.target.value })}
        className="flex-1"
      />
      <Select
        value={data.level}
        onValueChange={(value: 'beginner' | 'familiar' | 'expert') => onChange({ level: value })}
      >
        <Select.Trigger className="w-32">
          <Select.Value placeholder="熟练程度" />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="beginner">初学</Select.Item>
          <Select.Item value="familiar">熟悉</Select.Item>
          <Select.Item value="expert">精通</Select.Item>
        </Select.Content>
      </Select>
      <Input
        placeholder="分类（可选）"
        value={data.category}
        onChange={e => onChange({ category: e.target.value })}
        className="w-32"
      />
    </div>
  );
}
```

- [ ] **Step 4: Create ProjectBlock.tsx**

```typescript
import React from 'react';
import { ProjectData } from '../../types/resume';
import { Input } from '@kn/ui/components/ui/input';
import { Textarea } from '@kn/ui/components/ui/textarea';

interface ProjectBlockProps {
  data: ProjectData;
  onChange: (data: Partial<ProjectData>) => void;
}

export function ProjectBlock({ data, onChange }: ProjectBlockProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Input
          placeholder="项目名称"
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
        />
        <Input
          placeholder="时间"
          value={data.time}
          onChange={e => onChange({ time: e.target.value })}
        />
        <Input
          placeholder="角色"
          value={data.role}
          onChange={e => onChange({ role: e.target.value })}
        />
      </div>
      <Input
        placeholder="技术栈（逗号分隔）"
        value={data.techStack?.join(', ') || ''}
        onChange={e => onChange({ techStack: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
      />
      <Textarea
        placeholder="项目描述"
        value={data.description}
        onChange={e => onChange({ description: e.target.value })}
        rows={3}
      />
    </div>
  );
}
```

- [ ] **Step 5: Create AwardBlock.tsx**

```typescript
import React from 'react';
import { AwardData } from '../../types/resume';
import { Input } from '@kn/ui/components/ui/input';
import { Textarea } from '@kn/ui/components/ui/textarea';

interface AwardBlockProps {
  data: AwardData;
  onChange: (data: Partial<AwardData>) => void;
}

export function AwardBlock({ data, onChange }: AwardBlockProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Input
          placeholder="证书/奖项名称"
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
        />
        <Input
          placeholder="颁发机构"
          value={data.issuer}
          onChange={e => onChange({ issuer: e.target.value })}
        />
        <Input
          placeholder="获得时间"
          value={data.date}
          onChange={e => onChange({ date: e.target.value })}
        />
      </div>
      <Textarea
        placeholder="描述"
        value={data.description}
        onChange={e => onChange({ description: e.target.value })}
        rows={2}
      />
    </div>
  );
}
```

- [ ] **Step 6: Create CustomBlock.tsx**

```typescript
import React from 'react';
import { CustomData } from '../../types/resume';
import { Textarea } from '@kn/ui/components/ui/textarea';
import { Select } from '@kn/ui/components/ui/select';

interface CustomBlockProps {
  data: CustomData;
  onChange: (data: Partial<CustomData>) => void;
}

export function CustomBlock({ data, onChange }: CustomBlockProps) {
  return (
    <div className="space-y-2">
      <Select
        value={data.style}
        onValueChange={(value: 'normal' | 'heading' | 'quote') => onChange({ style: value })}
      >
        <Select.Trigger className="w-32">
          <Select.Value placeholder="样式" />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="normal">普通</Select.Item>
          <Select.Item value="heading">标题</Select.Item>
          <Select.Item value="quote">引用</Select.Item>
        </Select.Content>
      </Select>
      <Textarea
        placeholder="自定义内容"
        value={data.content}
        onChange={e => onChange({ content: e.target.value })}
        rows={4}
      />
    </div>
  );
}
```

- [ ] **Step 7: Create index.ts**

```typescript
export { BasicInfoBlock } from './BasicInfoBlock';
export { EducationBlock } from './EducationBlock';
export { WorkBlock } from './WorkBlock';
export { SkillBlock } from './SkillBlock';
export { ProjectBlock } from './ProjectBlock';
export { AwardBlock } from './AwardBlock';
export { CustomBlock } from './CustomBlock';
```

- [ ] **Step 8: Commit**

```bash
git add packages/plugin-resume/src/components/ResumeBlocks/
git commit -m "feat(resume): add all atomic block components

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: 编辑器核心

### Task 6: 创建组件选择面板

**Files:**
- Create: `packages/plugin-resume/src/components/BlockPicker/BlockPicker.tsx`

- [ ] **Step 1: Create BlockPicker.tsx**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-resume/src/components/BlockPicker/BlockPicker.tsx
git commit -m "feat(resume): add BlockPicker component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: 创建简历编辑器主页面

**Files:**
- Create: `packages/plugin-resume/src/pages/ResumeEditor.tsx`

- [ ] **Step 1: Create ResumeEditor.tsx**

```typescript
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
    style,
    isDirty,
    updateTitle,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
    clearDraft
  } = useResume(initialData);

  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  const handleSave = () => {
    onSave?.({ resume, style });
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
        <div className="relative">
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
                onClick={() => setActiveBlockId(block.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-sm text-muted-foreground">
                    {getBlockTitle(block.type)}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveBlock(block.id, 'up');
                      }}
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveBlock(block.id, 'down');
                      }}
                      disabled={index === resume.blocks.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBlock(block.id);
                      }}
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-resume/src/pages/ResumeEditor.tsx
git commit -m "feat(resume): add ResumeEditor page

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: 创建插件入口

**Files:**
- Create: `packages/plugin-resume/src/index.tsx`

- [ ] **Step 1: Create index.tsx**

```typescript
import { KPlugin, PluginConfig } from '@kn/common';
import { ResumeEditor } from './pages/ResumeEditor';

interface ResumePluginConfig extends PluginConfig {}

class ResumePlugin extends KPlugin<ResumePluginConfig> {}

export const resume = new ResumePlugin({
  name: 'Resume',
  status: 'ACTIVE',
  routes: [
    { name: '/resume/new', path: '/resume/new', element: <ResumeEditor /> },
    { name: '/resume/edit/:id', path: '/resume/edit/:id', element: <ResumeEditor /> }
  ],
  editorExtension: []
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-resume/src/index.tsx
git commit -m "feat(resume): add plugin entry point

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: 风格设置与集成

### Task 9: 创建风格设置面板

**Files:**
- Create: `packages/plugin-resume/src/components/StyleSettings/StylePanel.tsx`

- [ ] **Step 1: Create StylePanel.tsx**

```typescript
import React from 'react';
import { StyleConfig } from '../../types/resume';
import { Card } from '@kn/ui/components/ui/card';
import { Button } from '@kn/ui/components/ui/button';

interface StylePanelProps {
  style: StyleConfig;
  onChange: (style: Partial<StyleConfig>) => void;
}

const themes = [
  { id: 'blue', color: '#3b82f6', label: '蓝色' },
  { id: 'green', color: '#22c55e', label: '绿色' },
  { id: 'purple', color: '#a855f7', label: '紫色' },
  { id: 'dark', color: '#1f2937', label: '深色' },
  { id: 'light', color: '#f3f4f6', label: '浅色' }
] as const;

const layouts = [
  { id: 'single', label: '单栏' },
  { id: 'double', label: '双栏' },
  { id: 'triple', label: '三栏' }
] as const;

const spacings = [
  { id: 'compact', label: '紧凑' },
  { id: 'normal', label: '标准' },
  { id: 'loose', label: '宽松' }
] as const;

export function StylePanel({ style, onChange }: StylePanelProps) {
  return (
    <Card className="p-4 space-y-6 w-72">
      <div>
        <h3 className="font-medium mb-3">主题色</h3>
        <div className="flex gap-2">
          {themes.map(theme => (
            <button
              key={theme.id}
              className={`w-8 h-8 rounded-full border-2 ${
                style.theme === theme.id ? 'border-primary' : 'border-transparent'
              }`}
              style={{ backgroundColor: theme.color }}
              onClick={() => onChange({ theme: theme.id })}
              title={theme.label}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">布局</h3>
        <div className="flex gap-2">
          {layouts.map(layout => (
            <Button
              key={layout.id}
              variant={style.layout === layout.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange({ layout: layout.id })}
            >
              {layout.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">间距</h3>
        <div className="flex gap-2">
          {spacings.map(spacing => (
            <Button
              key={spacing.id}
              variant={style.spacing === spacing.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChange({ spacing: spacing.id })}
            >
              {spacing.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">字体</h3>
        <select
          className="w-full p-2 border rounded"
          value={style.titleFont}
          onChange={e => onChange({ titleFont: e.target.value })}
        >
          <option value="Inter">Inter</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
        </select>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-resume/src/components/StyleSettings/StylePanel.tsx
git commit -m "feat(resume): add StylePanel component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: 构建并测试

- [ ] **Step 1: Build the plugin**

```bash
cd packages/plugin-resume && pnpm build
```

- [ ] **Step 2: Test in app**

```bash
pnpm dev
```

---

## 验收标准

1. ✅ 插件包结构正确
2. ✅ 类型定义完整
3. ✅ useResume hook 工作正常
4. ✅ 所有原子组件可编辑
5. ✅ 组件添加/删除/排序功能正常
6. ✅ 风格设置面板可用
7. ✅ 页面可访问
