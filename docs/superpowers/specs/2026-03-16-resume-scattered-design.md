# 简历插件重构 - 散列式设计

**目标：** 去掉简历容器，每个组件独立散列在编辑器中，使用编辑器自带的 columns 组件实现分栏

## 1. 设计变更

### 核心变化
- 移除 `resume` 根节点容器
- 7 种组件（基础信息、教育经历、工作经历、技能、项目经验、证书奖项、自定义文本）作为独立 Tiptap 节点
- 使用编辑器自带的 columns 组件实现分栏
- 组件数据通过 Node View 原地编辑

### 架构
```
编辑器内容：
├── 基础信息 (独立节点)
├── Columns (编辑器自带)
│   ├── 列1
│   │   ├── 教育经历
│   │   └── 工作经历
│   └── 列2
│       ├── 项目经验
│       └── 证书奖项
└── 技能 (独立节点)
```

## 2. 组件设计

### 7 种原子组件

| 组件 | 类型名称 | slash 命令 | 数据字段 |
|-----|---------|-----------|---------|
| 基础信息 | basicInfo | /基础信息 | name, email, phone, address |
| 教育经历 | education | /教育 | school, degree, major, startDate, endDate |
| 工作经历 | work | /工作 | company, position, startDate, endDate |
| 技能 | skill | /技能 | name, level |
| 项目经验 | project | /项目 | name, time, role, description |
| 证书奖项 | award | /奖项 | name, issuer, date |
| 自定义文本 | custom | /文本 | content, style |

### 组件结构
每个组件都是一个 Tiptap Node Extension：
- Node View 用于展示和编辑
- 原地编辑数据
- 支持拖拽排序

## 3. 分栏实现

直接使用编辑器自带的 columns 组件：
- 用户通过 `/columns` 或工具栏插入分栏
- 将组件拖入列中
- 支持 2-4 列

## 4. 交互流程

### 插入组件
1. 输入 `/` 唤起 slash 菜单
2. 选择组件类型（如 /教育）
3. 组件插入到光标位置

### 编辑数据
1. 点击组件进入编辑模式
2. 直接在 Node View 中修改字段
3. 失去焦点自动保存

### 调整布局
1. 使用 columns 组件创建分栏
2. 拖拽组件到列中
3. 组件可以跨列移动

## 5. 技术实现

### 插件结构
```
packages/plugin-resume/src/
├── extension/
│   ├── basicInfo/
│   │   ├── index.ts
│   │   └── BasicInfoNodeView.tsx
│   ├── education/
│   ├── work/
│   ├── skill/
│   ├── project/
│   ├── award/
│   └── custom/
└── index.tsx
```

### 每个组件
- 独立的 Tiptap Node Extension
- React NodeViewRenderer 实现
- 原地编辑模式

## 6. 兼容性

- 旧版简历数据通过迁移脚本转换
- 转换后的组件散列在页面中
