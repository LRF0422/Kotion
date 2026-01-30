# Bitable Plugin - 多维表格插件

参照飞书多维表格打造的强大多维表格插件，支持多种视图类型和丰富的字段类型。

## ✨ 特性

### 📊 多种视图类型
- **表格视图** - 传统的表格形式，支持排序、筛选、搜索
- **看板视图** - 按字段分组的看板视图，类似 Trello
- **画廊视图** - 卡片形式展示，支持封面图片

### 🎯 丰富的字段类型
- **基础字段**
  - 文本 (Text)
  - 数字 (Number)  
  - 日期 (Date)
  - 复选框 (Checkbox)
  - URL
  - Email
  - 电话 (Phone)

- **高级字段**
  - 单选 (Select)
  - 多选 (Multi Select)
  - 评分 (Rating) - 星级评分
  - 进度条 (Progress) - 0-100%
  - ID / 自动编号

### 🔧 核心功能
- ✅ 添加/编辑/删除记录
- ✅ 添加/编辑/删除字段
- ✅ 多视图切换
- ✅ 记录搜索
- ✅ 批量删除
- ✅ 字段显示/隐藏
- ✅ 列宽调整

## 📦 安装

```bash
cd packages/plugin-bitable
pnpm install
pnpm build
```

## 🚀 使用

### 1. 在应用中注册插件

```typescript
import { bitable } from "@kn/plugin-bitable";
import { App } from "@kn/core";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App plugins={[..., bitable]} />
)
```

### 2. 通过斜杠命令插入

在编辑器中输入：
- `/bitable` - 插入多维表格
- `/多维表格` - 插入多维表格

### 3. 通过代码插入

```typescript
editor.commands.insertBitable(['字段1', '字段2', '字段3']);
```

## 🎨 视图类型说明

### 表格视图 (Table View)
传统的数据表格视图，支持：
- 行列编辑
- 多选操作
- 搜索功能
- 列宽调整
- 字段排序

### 看板视图 (Kanban View)
按单选字段分组的看板视图：
- 自动按选项分组
- 拖拽排序（计划中）
- 卡片形式展示
- 快速添加

### 画廊视图 (Gallery View)
卡片画廊形式：
- 支持封面图片
- 三种卡片尺寸
- 响应式布局
- 悬停效果

## 🏗️ 技术架构

```
plugin-bitable/
├── src/
│   ├── bitable/
│   │   ├── bitable-node.ts      # 节点定义
│   │   ├── BitableView.tsx      # 主视图组件
│   │   ├── views/               # 各种视图实现
│   │   │   ├── TableView.tsx    # 表格视图
│   │   │   ├── KanbanView.tsx   # 看板视图
│   │   │   └── GalleryView.tsx  # 画廊视图
│   │   ├── fields/              # 字段渲染器
│   │   │   └── FieldRenderers.tsx
│   │   └── index.tsx            # 扩展配置
│   ├── types/
│   │   └── index.ts             # 类型定义
│   └── index.tsx                # 插件入口
```

## 🔄 数据结构

### 字段配置
```typescript
{
  id: string;
  title: string;
  type: FieldType;
  width?: number;
  isShow?: boolean;
  options?: SelectOption[];  // 用于单选/多选
}
```

### 记录数据
```typescript
{
  id: string;
  [fieldId: string]: any;
  createdTime?: string;
  updatedTime?: string;
}
```

### 视图配置
```typescript
{
  id: string;
  name: string;
  type: ViewType;
  filters?: FilterConfig[];
  sorts?: SortConfig[];
  groups?: GroupConfig[];
}
```

## 🎯 开发计划

- [x] 基础表格视图
- [x] 看板视图
- [x] 画廊视图
- [x] 多种字段类型
- [ ] 日历视图
- [ ] 时间线视图
- [ ] 表单视图
- [ ] 拖拽排序
- [ ] 高级筛选
- [ ] 高级排序
- [ ] 分组功能
- [ ] 条件格式
- [ ] 公式字段
- [ ] 关联字段
- [ ] 附件上传
- [ ] 人员选择
- [ ] 数据导入/导出

## 📝 示例

```typescript
// 创建带自定义字段的表格
editor.commands.insertBitable(['任务名称', '负责人', '优先级', '状态']);

// 默认会包含以下字段：
// - ID (自动编号)
// - 名称 (文本)
// - 状态 (单选: 未开始/进行中/已完成)
// - 优先级 (单选: 低/中/高)
// - 负责人 (人员)
// - 截止日期 (日期)
// - 进度 (进度条)
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
