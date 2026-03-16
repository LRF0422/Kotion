# 简历插件设计规范

## 1. 项目概述

- **项目名称**: Resume Plugin (简历插件)
- **项目类型**: 知识库插件
- **核心功能**: 提供简历原子组件，用户通过拖拽组件块到页面进行排版，所见即所得
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

2. **简历编辑器**（所见即所得）
   - 输入 `/` 弹出组件菜单选择添加
   - 点击 + 按钮弹出组件选择面板
   - 每个组件块可直接编辑内容
   - 支持拖拽调整组件块顺序（或上下移动按钮）
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
   - 导出为 PDF（html2canvas + jsPDF）

## 3. 技术架构

### 3.1 插件结构

```
packages/plugin-resume/
├── src/
│   ├── index.tsx                 # 插件入口
│   ├── pages/
│   │   ├── ResumeList.tsx        # 简历列表页
│   │   └── ResumeEditor.tsx      # 简历编辑器主页面
│   ├── components/
│   │   ├── ResumeBlocks/         # 原子组件块
│   │   │   ├── BasicInfoBlock.tsx
│   │   │   ├── EducationBlock.tsx
│   │   │   ├── WorkBlock.tsx
│   │   │   ├── SkillBlock.tsx
│   │   │   ├── ProjectBlock.tsx
│   │   │   └── AwardBlock.tsx
│   │   ├── BlockPicker/         # 组件选择面板
│   │   │   └── BlockPicker.tsx
│   │   ├── StyleSettings/       # 风格设置
│   │   │   └── StylePanel.tsx
│   │   └── EditorExtension/     # 编辑器扩展
│   │       └── ResumeExtension.ts
│   ├── types/
│   │   └── resume.ts            # 类型定义
│   ├── hooks/
│   │   └── useResume.ts        # 简历数据管理
│   └── utils/
│       ├── templates.ts         # 模板配置
│       └── themes.ts            # 主题色配置
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
  blocks: ResumeBlock[];  // 组件块列表（顺序即排版）
}

// 组件块（支持任意顺序排列）
interface ResumeBlock {
  id: string;
  type: 'basicInfo' | 'education' | 'work' | 'skill' | 'project' | 'award' | 'custom';
  data: BasicInfoData | EducationData | WorkData | SkillData | ProjectData | AwardData | CustomData;
  order: number;  // 排序
}

// 基础信息
interface BasicInfoData {
  name: string;
  email: string;
  phone: string;
  address?: string;
  avatar?: string;
  summary?: string;
}

// 教育经历 - 支持"进行中"状态
interface EducationData {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;
  description?: string;
}

// 工作经历 - 支持"进行中"状态
interface WorkData {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;
  description?: string;
}

// 技能
interface SkillData {
  id: string;
  name: string;
  level: 'beginner' | 'familiar' | 'expert';
  category?: string;
}

// 项目经验
interface ProjectData {
  id: string;
  name: string;
  time: string;
  role: string;
  techStack?: string[];
  description?: string;
}

// 证书奖项
interface AwardData {
  id: string;
  name: string;
  issuer: string;
  date: string;
  description?: string;
}

// 自定义文本块
interface CustomData {
  content: string;
  style?: 'normal' | 'heading' | 'quote';
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

### 4.1 编辑器布局（所见即所得）

```
┌─────────────────────────────────────────────────────────────┐
│  简历编辑器                    [+] [风格设置] [导出PDF]     │
├─────────────────────────────────────────────────────────────┤
│  / 基础信息...                                            │
├─────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 基础信息块                                            │   │
│  │ ┌───────┐  张三                                      │   │
│  │ │ 头像 │  前端工程师                                 │   │
│  │ └───────┘  email@xxx.com | 138xxxx8888              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 教育经历块                                            │   │
│  │ ▸ 清华大学 - 计算机科学硕士                           │   │
│  │   2020-2023                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 工作经历块                                            │   │
│  │ ▸ xx公司 - 前端工程师                               │   │
│  │   2023-至今                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                            │
│  /                                                        │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 组件选择

方式1：输入 `/` 弹出命令菜单
```
/ 基础信息...
/ 教育经历...
/ 工作经历...
/ 技能...
/ 项目...
/ 证书奖项...
/ 自定义文本...
```

方式2：点击顶部 `+` 按钮弹出组件面板

### 4.3 风格设置面板

```
┌─────────────────────┐
│  风格设置           │
├─────────────────────┤
│  主题色             │
│  ● ○ ○ ○ ○        │
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
- 基础信息、教育、工作、技能、项目、证书奖项组件块
- 组件添加和拖拽排序
- 保存/加载功能
- 自动保存到 localStorage

### 第二阶段
- 主题色切换
- 字体设置
- 布局模板切换
- 简历复制功能

### 第三阶段
- 间距调整
- PDF 导出
- 更多模板

## 6. 验收标准

1. 用户可以通过添加组件创建各类简历块
2. 用户可以拖拽调整组件块的顺序
3. 用户可以直接编辑每个组件块的内容
4. 风格设置可以改变简历外观效果
5. 简历可以保存到知识库页面
6. 再次打开可以加载已有简历
7. 布局模板切换正常工作
