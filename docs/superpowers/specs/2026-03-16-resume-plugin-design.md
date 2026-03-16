# 简历插件设计规范

## 1. 项目概述

- **项目名称**: Resume Plugin (简历插件)
- **项目类型**: 知识库插件
- **核心功能**: 提供简历创建、编辑、预览和管理功能，用户通过表单填写信息，系统自动生成美观排版的简历
- **目标用户**: 知识库用户（求职者、职场人士、学生）

## 2. 功能列表

### 2.1 原子组件

| 组件类型 | 字段 |
|----------|------|
| 基础信息 | 姓名、邮箱、手机、地址、头像URL、个人简介 |
| 教育经历 | 学校、学位、专业、开始时间、结束时间、描述（可多段） |
| 工作经历 | 公司名称、职位、开始时间、结束时间、职责描述（可多段） |
| 技能 | 技能名称、熟练程度（初学/熟悉/精通）、分类 |
| 项目经验 | 项目名称、时间、角色、技术栈、描述（可多段） |
| 证书奖项 | 名称、颁发机构、获得时间、描述 |

### 2.2 核心功能

1. **简历列表页** (`/resume`)
   - 展示所有已创建的简历卡片
   - 支持创建新简历、复制、删除操作

2. **简历编辑页面**
   - 左侧：分类型的表单填写区域
   - 右侧：实时简历预览
   - 自动保存到 localStorage（防丢失）

3. **风格设置面板**
   - 主题色选择（预设5套配色）
   - 字体选择（标题字体、正文字体）
   - 布局模板（单栏、双栏、三栏）
   - 间距/边距调整

4. **简历保存与加载**
   - 保存为知识库页面（JSON Block格式）
   - 从知识库页面加载简历数据

5. **导出功能**
   - 导出为知识库页面（Markdown渲染）
   - 导出为 PDF（html2canvas + jsPDF）

## 3. 技术架构

### 3.1 插件结构

```
packages/plugin-resume/
├── src/
│   ├── index.tsx                 # 插件入口
│   ├── pages/
│   │   └── ResumeEditor.tsx      # 简历编辑器主页面
│   ├── components/
│   │   ├── ResumeForm/           # 表单组件
│   │   │   ├── BasicInfoForm.tsx
│   │   │   ├── EducationForm.tsx
│   │   │   ├── WorkForm.tsx
│   │   │   ├── SkillForm.tsx
│   │   │   ├── ProjectForm.tsx
│   │   │   └── AwardForm.tsx
│   │   ├── ResumePreview/       # 预览组件
│   │   │   ├── ResumePreview.tsx
│   │   │   └── templates/       # 布局模板
│   │   │       ├── SingleColumn.tsx
│   │   │       ├── DoubleColumn.tsx
│   │   │       └── TripleColumn.tsx
│   │   ├── StyleSettings/       # 风格设置
│   │   │   └── StylePanel.tsx
│   │   └── EditorExtension/     # 编辑器扩展（可选）
│   ├── types/
│   │   └── resume.ts            # 类型定义
│   ├── hooks/
│   │   └── useResume.ts         # 简历数据管理
│   └── utils/
│       └── templates.ts         # 模板配置
```

### 3.2 数据结构

```typescript
// 简历元数据
interface ResumeData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  version: number;  // 乐观锁
  basicInfo: BasicInfo;
  education: Education[];
  work: WorkExperience[];
  skills: Skill[];
  projects: Project[];
  awards: Award[];
}

// 基础信息
interface BasicInfo {
  name: string;
  email: string;
  phone: string;
  address?: string;
  avatar?: string;
  summary?: string;
}

// 教育经历 - 支持"进行中"状态
interface Education {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;  // 进行中
  description?: string;
}

// 工作经历 - 支持"进行中"状态
interface WorkExperience {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;  // 进行中
  description?: string;
}

// 技能
interface Skill {
  id: string;
  name: string;
  level: 'beginner' | 'familiar' | 'expert';
  category?: string;
}

// 项目经验
interface Project {
  id: string;
  name: string;
  time: string;
  role: string;
  techStack?: string[];
  description?: string;
}

// 证书奖项
interface Award {
  id: string;
  name: string;
  issuer: string;
  date: string;
  description?: string;
}

// 风格配置
interface StyleConfig {
  theme: 'blue' | 'green' | 'purple' | 'dark' | 'light';
  titleFont: string;
  bodyFont: string;
  layout: 'single' | 'double' | 'triple';
  spacing: 'compact' | 'normal' | 'loose';
}

// 知识库Block存储格式
const RESUME_BLOCK_TYPE = 'kn:resume';
interface ResumeBlock {
  type: typeof RESUME_BLOCK_TYPE;
  attrs: {
    data: ResumeData;
    style: StyleConfig;
  };
}
```

### 3.3 页面路由

- `/resume` - 简历列表页
- `/resume/new` - 新建简历
- `/resume/:pageId` - 编辑已有简历

## 4. UI 设计方向

### 4.1 编辑器布局

```
┌─────────────────────────────────────────────────────────────┐
│  简历编辑器                              [保存] [导出PDF]   │
├────────────────────┬────────────────────────────────────────┤
│                    │                                        │
│  基础信息          │         实时预览区域                    │
│  ┌──────────────┐ │    ┌──────────────────────────┐      │
│  │ 姓名: ____   │ │    │     张三                   │      │
│  │ 邮箱: ____   │ │    │     前端工程师             │      │
│  │ 电话: ____   │ │    │     email@xxx.com          │      │
│  └──────────────┘ │    └──────────────────────────┘      │
│                    │                                        │
│  教育经历          │    教育背景                            │
│  [+ 添加]          │    ▪ 清华大学 - 计算机科学硕士          │
│                    │      2020-2023                         │
│  工作经历          │                                        │
│  [+ 添加]          │    工作经历                            │
│                    │    ▪ xx公司 - 前端工程师                │
│  技能              │      2023-至今                         │
│  [+ 添加]          │                                        │
│  ...               │    技能                                │
│                    │    ▪ React, TypeScript, Node.js       │
│  [风格设置]        │                                        │
└────────────────────┴────────────────────────────────────────┘
```

### 4.2 风格设置面板

```
┌─────────────────────┐
│  风格设置           │
├─────────────────────┤
│  主题色             │
│  ● ○ ○ ○ ○         │
│                     │
│  布局               │
│  [单栏] [双栏] [三栏]│
│                     │
│  标题字体           │
│  [选择...]          │
│                     │
│  正文字体           │
│  [选择...]          │
│                     │
│  间距               │
│  [紧凑] [标准] [宽松]│
└─────────────────────┘
```

## 5. 实现优先级

### 第一阶段（MVP）
- 简历列表页
- 基础信息、教育、工作、技能、项目、证书奖项组件
- 单栏布局模板
- 保存/加载功能
- 自动保存到 localStorage

### 第二阶段
- 双栏/三栏布局
- 主题色切换
- 字体设置
- 简历复制功能

### 第三阶段
- 间距调整
- PDF 导出
- 更多模板

## 6. 验收标准

1. 用户可以填写所有类型的简历信息
2. 实时预览正确显示填写的内容
3. 风格设置可以改变预览效果
4. 简历可以保存到知识库页面
5. 再次打开可以加载已有简历
6. 布局模板切换正常工作
