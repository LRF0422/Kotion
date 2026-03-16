# 简历插件重构 - 分栏布局设计

**目标：** 将简历插件从简单的垂直列表改为支持多列网格布局，用户可手动创建列并在每列中添加组件。

## 1. 数据结构

### 简历整体结构
```typescript
interface ResumeData {
  id: string;
  title: string;
  columns: Column[];  // 列数组，支持2-4列
}

interface Column {
  id: string;
  width: number;      // 宽度权重 1-3，默认1
  blocks: ResumeBlock[];  // 列内的组件块
}

interface ResumeBlock {
  id: string;
  type: BlockType;
  data: BasicInfoData | EducationData | WorkData | SkillData | ProjectData | AwardData | CustomData;
}

type BlockType = 'basicInfo' | 'education' | 'work' | 'skill' | 'project' | 'award' | 'custom';
```

### 组件块类型
与现有设计一致：
- `basicInfo`: 基础信息
- `education`: 教育经历
- `work`: 工作经历
- `skill`: 技能
- `project`: 项目经验
- `award`: 证书奖项
- `custom`: 自定义文本

## 2. 布局架构

### 多列网格系统
- 支持 2-4 列
- 每列宽度用权重表示（1-3），默认都是1
- 列之间有固定间距（16px）
- 使用 CSS Flexbox 实现，均分宽度后按权重分配
- 2列：各50%；3列：各33%；4列：各25%
- 权重调整后重新计算实际宽度

### 布局示意
```
┌─────────────┬─────────────┬─────────────┐
│   基础信息   │   教育经历   │   工作经历   │
│   技能      │   项目经验   │   证书奖项   │
└─────────────┴─────────────┴─────────────┘
    ↑           ↑           ↑
  宽度调节    宽度调节    宽度调节
```

## 3. UI 设计

### 简历节点视图
- **标题栏**：简历标题 + 编辑按钮
- **工具栏**：添加/删除列按钮，列数选择器
- **网格区域**：显示所有列，每列可独立编辑
- **列操作**：列宽度拖拽、删除列

### 组件块
- 保留现有的 7 种原子组件
- 组件只能在列内移动，不能跨列
- 每列内的组件支持上下排序

### 视觉风格 - 现代简洁
- 白色卡片，浅灰色背景
- 轻微阴影区分层次
- 标题使用深色字，正文使用灰色
- 间距统一为 8px/16px/24px

## 4. 交互流程

### 创建简历
1. 输入 `/resume` 插入简历块
2. 自动创建 2 列默认布局
3. 用户可通过工具栏添加更多列（最多4列）

### 添加组件
1. **列内添加按钮**：每列底部有 "添加组件" 按钮
2. **Slash 命令**：输入 `/基础信息` 等命令添加到当前激活列

### 调整布局
1. 拖拽列边缘调整宽度
2. 拖拽列顶部移动整列顺序
3. 点击删除按钮移除列（保留组件）

## 5. 边界情况处理

- **空列显示**：显示虚线边框 + "点击添加组件" 提示
- **删除列**：弹出确认，列内组件自动合并到相邻列或删除
- **列数限制**：4列时"添加列"按钮自动禁用
- **响应式断点**：
  - 桌面端 (>1024px)：2-4 列并行
  - 平板端 (768-1024px)：最多3列
  - 移动端 (<768px)：自动转为单列堆叠
- **数据迁移**：旧版单列数据自动转为 2 列布局，blocks 放入第1列

## 5. 技术实现

### Tiptap 扩展
- 保持使用 Node Extension + ReactNodeViewRenderer
- 状态存储在 `node.attrs.data` 中
- 通过 `updateAttributes` 更新数据

### 组件结构
```
src/extension/
├── resume/
│   ├── resume.ts          # Tiptap Node 定义
│   ├── ResumeNodeView.tsx # 主节点视图
│   ├── Column.tsx         # 列组件
│   └── ColumnResizer.tsx  # 列宽调节器
└── ResumeBlocks/          # 7种原子组件（复用）
```

### 样式
- 使用 Tailwind CSS
- 响应式：移动端自动转为单列

## 6. 兼容性

- 保持与现有 slash 菜单兼容
- 保留数据迁移路径（旧版本数据可正常显示）
- 不影响其他插件
