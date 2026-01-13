# 多维表格插件 (Bitable Plugin)

我已经成功创建了一个参照飞书多维表格的强大多维表格插件！🎉

## 📦 插件位置

```
/home/Leong/Desktop/knowledge-repo/packages/plugin-bitable/
```

## ✨ 已实现的功能

### 1. 多种视图类型
- ✅ **表格视图 (Table View)** - 完整的数据表格，支持编辑、搜索、批量操作
- ✅ **看板视图 (Kanban View)** - 按字段分组的看板，类似Trello
- ✅ **画廊视图 (Gallery View)** - 卡片式画廊展示

### 2. 丰富的字段类型
- ✅ **文本** (Text)
- ✅ **数字** (Number)
- ✅ **单选** (Select) - 带颜色标签
- ✅ **多选** (Multi Select) - 支持多个标签
- ✅ **日期** (Date) - 完整的日期选择器
- ✅ **复选框** (Checkbox)
- ✅ **评分** (Rating) - 星级评分 ⭐
- ✅ **进度条** (Progress) - 0-100%
- ✅ **URL** - 可点击链接
- ✅ **Email** - 邮件链接
- ✅ **电话** (Phone) - 电话链接
- ✅ **ID / 自动编号** - 只读字段

### 3. 核心功能
- ✅ 添加/编辑/删除记录
- ✅ 添加/编辑/删除字段
- ✅ 添加/删除视图
- ✅ 视图切换
- ✅ 记录搜索
- ✅ 批量选择和删除
- ✅ 列宽调整
- ✅ 字段显示/隐藏

## 🚀 快速开始

### 1. 安装依赖

```bash
cd /home/Leong/Desktop/knowledge-repo
pnpm install
```

### 2. 构建插件

```bash
cd packages/plugin-bitable
pnpm build
```

### 3. 在应用中使用

编辑 `apps/vite/src/main.tsx`:

```typescript
import { bitable } from "@kn/plugin-bitable"

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App plugins={[
    DefaultPluginInstance, 
    fileManager, 
    mermaid, 
    database, 
    excalidraw, 
    drawnix, 
    drawio, 
    blockReference, 
    ai, 
    mindmapCanvas,
    bitable  // 👈 添加这一行
  ]} />
)
```

### 4. 使用插件

在编辑器中：
- 输入 `/bitable` 或 `/多维表格` 即可插入

## 📂 项目结构

```
plugin-bitable/
├── package.json              # 依赖配置
├── tsconfig.json            # TypeScript配置
├── rollup.config.mjs        # 构建配置
├── README.md                # 详细文档
└── src/
    ├── index.tsx            # 插件入口
    ├── types/
    │   └── index.ts         # 完整类型定义
    └── bitable/
        ├── index.tsx        # 扩展配置
        ├── bitable-node.ts  # 节点定义
        ├── BitableView.tsx  # 主视图组件
        ├── views/           # 视图实现
        │   ├── TableView.tsx
        │   ├── KanbanView.tsx
        │   └── GalleryView.tsx
        └── fields/          # 字段渲染器
            └── FieldRenderers.tsx
```

## 🎯 特色亮点

### 1. 类型安全
- 完整的 TypeScript 类型定义
- 所有接口都有详细的类型注解

### 2. 灵活的架构
- 易于扩展新的视图类型
- 易于添加新的字段类型
- 组件高度模块化

### 3. 优秀的用户体验
- 流畅的视图切换
- 直观的操作界面
- 实时数据更新

### 4. 参照飞书设计
- 视图切换类似飞书多维表格
- 字段类型丰富
- 支持多视图管理

## 🔧 技术栈

- **React 18** - UI框架
- **TypeScript** - 类型安全
- **TipTap** - 编辑器核心
- **react-data-grid** - 表格组件
- **shadcn/ui** - UI组件库
- **Tailwind CSS** - 样式

## 📸 功能演示

### 表格视图
- 传统数据表格形式
- 支持单元格编辑
- 多选批量操作
- 实时搜索

### 看板视图
- 按单选字段自动分组
- 卡片式展示
- 快速添加新记录
- 分组统计

### 画廊视图
- 美观的卡片布局
- 支持封面图片
- 三种卡片尺寸
- 响应式设计

## 🎓 使用示例

```typescript
// 插入默认配置的表格
editor.commands.insertBitable()

// 插入带自定义字段的表格
editor.commands.insertBitable(['项目名称', '负责人', '截止时间'])
```

## 🌟 未来计划

- [ ] 日历视图
- [ ] 时间线视图 (甘特图)
- [ ] 表单视图
- [ ] 拖拽排序功能
- [ ] 高级筛选器
- [ ] 高级排序
- [ ] 条件格式化
- [ ] 公式字段
- [ ] 关联字段
- [ ] 附件上传
- [ ] 人员选择器
- [ ] 数据导入/导出
- [ ] 视图共享和权限

## 💡 提示

1. 默认会创建7个字段：ID、名称、状态、优先级、负责人、截止日期、进度
2. 可以随时添加新字段和新视图
3. 支持在表格视图中快速编辑
4. 看板视图自动按"状态"字段分组
5. 所有数据实时保存到编辑器节点中

## 🎉 完成！

插件已经创建完成，包含完整的功能和良好的代码结构。现在你可以：

1. 安装依赖并构建
2. 在应用中注册插件
3. 开始使用多维表格功能
4. 根据需要扩展更多功能

如有任何问题或需要添加更多功能，请随时告诉我！
