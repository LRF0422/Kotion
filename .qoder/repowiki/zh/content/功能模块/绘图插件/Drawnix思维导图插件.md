# Drawnix思维导图插件

<cite>
**本文引用的文件**
- [DrawnixView.tsx](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx)
- [drawnix.ts](file://packages/plugin-drawnix/src/extension/drawnix.ts)
- [data.ts](file://packages/plugin-drawnix/src/extension/data.ts)
- [index.tsx（扩展入口）](file://packages/plugin-drawnix/src/extension/index.tsx)
- [only-mind.tsx](file://packages/plugin-drawnix/src/extension/only-mind.tsx)
- [index.css（样式）](file://packages/plugin-drawnix/src/extension/style/index.css)
- [package.json（插件包）](file://packages/plugin-drawnix/package.json)
- [index.tsx（插件装配）](file://packages/plugin-drawnix/src/index.tsx)
- [mindmap-canvas.tsx](file://packages/plugin-mindmap-canvas/src/nodes/mindmap-canvas.tsx)
- [MindmapCanvasView.tsx](file://packages/plugin-mindmap-canvas/src/views/MindmapCanvasView.tsx)
- [default-data.ts](file://packages/plugin-mindmap-canvas/src/nodes/default-data.ts)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [组件详解](#组件详解)
6. [依赖关系分析](#依赖关系分析)
7. [性能与可扩展性](#性能与可扩展性)
8. [使用示例](#使用示例)
9. [故障排查](#故障排查)
10. [结论](#结论)

## 简介
本文件面向Drawnix思维导图插件的使用者与维护者，系统化阐述该插件在知识仓库编辑器中的集成方式与实现细节。内容涵盖：
- 思维导图视图组件的职责与渲染机制
- 数据结构设计与节点关系管理
- 交互逻辑与布局适配
- 样式定制与主题切换
- 使用示例：创建、编辑、导出
- 协作编辑能力与数据导入导出格式建议
- 性能优化策略与最佳实践

## 项目结构
Drawnix插件位于packages/plugin-drawnix目录下，采用“扩展+视图+数据初始化”的分层组织方式：
- 扩展定义：负责节点类型、命令注册与HTML渲染钩子
- 视图组件：封装Plait Board与React桥接，提供只画思维导图能力
- 数据初始化：提供默认思维导图树结构，便于首次渲染
- 插件装配：将扩展注册到编辑器插件体系中，并暴露slash命令

```mermaid
graph TB
subgraph "Drawnix插件"
A["扩展定义<br/>drawnix.ts"]
B["视图组件<br/>DrawnixView.tsx"]
C["仅思维导图包装<br/>only-mind.tsx"]
D["默认数据<br/>data.ts"]
E["样式<br/>style/index.css"]
F["扩展装配<br/>extension/index.tsx"]
G["插件装配<br/>src/index.tsx"]
end
A --> B
B --> C
B --> D
B --> E
F --> A
G --> F
```

**图表来源**
- [drawnix.ts](file://packages/plugin-drawnix/src/extension/drawnix.ts#L1-L43)
- [DrawnixView.tsx](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)
- [only-mind.tsx](file://packages/plugin-drawnix/src/extension/only-mind.tsx#L1-L67)
- [data.ts](file://packages/plugin-drawnix/src/extension/data.ts#L1-L212)
- [index.tsx（扩展入口）](file://packages/plugin-drawnix/src/extension/index.tsx#L1-L20)
- [index.tsx（插件装配）](file://packages/plugin-drawnix/src/index.tsx#L2-L14)

**章节来源**
- [drawnix.ts](file://packages/plugin-drawnix/src/extension/drawnix.ts#L1-L43)
- [DrawnixView.tsx](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)
- [only-mind.tsx](file://packages/plugin-drawnix/src/extension/only-mind.tsx#L1-L67)
- [data.ts](file://packages/plugin-drawnix/src/extension/data.ts#L1-L212)
- [index.tsx（扩展入口）](file://packages/plugin-drawnix/src/extension/index.tsx#L1-L20)
- [index.tsx（插件装配）](file://packages/plugin-drawnix/src/index.tsx#L2-L14)

## 核心组件
- 节点扩展（Drawnix）
  - 定义节点名为“drawnix”，作为块级原子节点
  - 提供插入命令insertDrawnix，用于在编辑器中插入该节点
  - 将节点属性data默认值设为null，实际初始值由视图组件注入
  - 渲染HTML时附加特定类名，便于统一样式控制
- 视图组件（DrawnixView）
  - 基于NodeViewWrapper包裹，承载React组件
  - 读取节点属性data，结合initializeData作为默认值
  - 通过OnlyMind桥接到Plait Board，启用思维导图渲染与交互
  - 监听主题变化并动态更新画板主题；初次挂载后自动适配视口
  - 暴露onChange回调，将变更写回节点属性，实现双向绑定
- 仅思维导图包装（OnlyMind）
  - 组合withDraw、withGroup、withMind等插件，聚焦思维导图能力
  - 支持只读模式、主题颜色、视口参数、选择与值变更回调
  - 提供afterInit回调，允许外部获取PlaitBoard实例以执行高级操作
- 默认数据（initializeData）
  - 提供一棵完整的思维导图树，包含根节点与若干分支节点
  - 包含topic文本、几何尺寸、坐标点等字段，便于快速演示
- 扩展装配（extension/index.tsx）
  - 将Drawnix扩展注册为编辑器扩展
  - 提供slash命令“/drawnix”，一键插入思维导图节点
- 插件装配（src/index.tsx）
  - 将DrawnixExtension注册为插件，供上层应用加载

**章节来源**
- [drawnix.ts](file://packages/plugin-drawnix/src/extension/drawnix.ts#L1-L43)
- [DrawnixView.tsx](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)
- [only-mind.tsx](file://packages/plugin-drawnix/src/extension/only-mind.tsx#L1-L67)
- [data.ts](file://packages/plugin-drawnix/src/extension/data.ts#L1-L212)
- [index.tsx（扩展入口）](file://packages/plugin-drawnix/src/extension/index.tsx#L1-L20)
- [index.tsx（插件装配）](file://packages/plugin-drawnix/src/index.tsx#L2-L14)

## 架构总览
Drawnix插件的运行链路如下：
- 编辑器通过slash命令触发插入节点
- 节点扩展创建drawnix节点并渲染视图
- 视图组件加载OnlyMind，传入初始数据与主题
- Plait Board渲染思维导图，支持交互编辑
- 变更通过onChange回写至节点属性，保持数据一致性

```mermaid
sequenceDiagram
participant U as "用户"
participant E as "编辑器"
participant X as "Drawnix扩展"
participant V as "DrawnixView"
participant M as "OnlyMind"
participant B as "Plait Board"
U->>E : 输入"/drawnix"
E->>X : 执行insertDrawnix命令
X-->>E : 插入drawnix节点
E-->>V : 渲染节点视图
V->>M : 传入value/viewport/theme/readonly
M->>B : 初始化withDraw/withGroup/withMind
B-->>V : 触发afterInit回调
V->>B : 主题切换/适配视口
U->>B : 交互编辑
B-->>V : onChange回调
V->>X : updateAttributes写回节点属性
```

**图表来源**
- [index.tsx（扩展入口）](file://packages/plugin-drawnix/src/extension/index.tsx#L1-L20)
- [drawnix.ts](file://packages/plugin-drawnix/src/extension/drawnix.ts#L1-L43)
- [DrawnixView.tsx](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)
- [only-mind.tsx](file://packages/plugin-drawnix/src/extension/only-mind.tsx#L1-L67)

## 组件详解

### DrawnixView：渲染机制与交互
- 渲染容器
  - 使用NodeViewWrapper包裹，确保与编辑器节点生命周期一致
  - 设置固定高度与阴影，保证在编辑器中具备良好的视觉边界
- 数据绑定
  - 从节点属性读取data.children作为初始值，若为空则回退到initializeData
  - 通过onChange回调将Plait Board的变更写回节点属性，形成双向数据流
- 主题与视口
  - 监听useTheme返回的主题状态，动态切换Plait Board主题色模式
  - 初次获得board实例后调用fitViewport，自动适配内容视图
- 只读模式
  - 根据编辑器是否可编辑设置readonly，避免非编辑态下的交互

```mermaid
flowchart TD
Start(["进入DrawnixView"]) --> ReadAttrs["读取节点属性data"]
ReadAttrs --> HasData{"存在children?"}
HasData --> |是| UseChildren["使用data.children作为初始值"]
HasData --> |否| UseDefault["使用initializeData作为初始值"]
UseChildren --> InitBoard["初始化OnlyMind并传入value/viewport/theme/readonly"]
UseDefault --> InitBoard
InitBoard --> ThemeWatch["监听主题变化并更新Board主题"]
InitBoard --> FitVP["初次挂载后适配视口"]
InitBoard --> Editable["根据编辑器状态设置只读/可编辑"]
InitBoard --> OnChange["监听onChange并将变更写回节点属性"]
ThemeWatch --> End(["完成"])
FitVP --> End
Editable --> End
OnChange --> End
```

**图表来源**
- [DrawnixView.tsx](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)
- [data.ts](file://packages/plugin-drawnix/src/extension/data.ts#L1-L212)

**章节来源**
- [DrawnixView.tsx](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)
- [data.ts](file://packages/plugin-drawnix/src/extension/data.ts#L1-L212)

### OnlyMind：思维导图渲染与插件组合
- 插件组合
  - withDraw：绘制能力
  - withGroup：分组与选择
  - withMind：思维导图专用布局与渲染
- 配置项
  - readonly：是否禁用交互
  - hideScrollbar/disabledScrollOnNonFocus：滚动行为控制
  - themeColors：Mind主题色板
  - 回调：onChange/onSelectionChange/onViewportChange/onThemeChange/onValueChange/afterInit
- 生命周期
  - afterInit回调提供PlaitBoard实例，可用于后续高级操作（如主题切换、视口控制）

```mermaid
classDiagram
class OnlyMind {
+value : PlaitElement[]
+viewport? : Viewport
+theme? : PlaitTheme
+readonly? : boolean
+onChange(data)
+onSelectionChange(selection)
+onViewportChange(viewport)
+onThemeChange(mode)
+onValueChange(elements)
+afterInit(board)
}
class Board {
+afterInit(board)
}
OnlyMind --> Board : "渲染并持有"
```

**图表来源**
- [only-mind.tsx](file://packages/plugin-drawnix/src/extension/only-mind.tsx#L1-L67)

**章节来源**
- [only-mind.tsx](file://packages/plugin-drawnix/src/extension/only-mind.tsx#L1-L67)

### 数据模型与节点关系
- 数据结构
  - initializeData提供一棵完整的思维导图树，包含根节点与多分支节点
  - 每个节点包含topic文本、几何尺寸(width/height)、坐标(points)、父子关系(children)
- 关系管理
  - 通过children数组表达层级关系
  - isRoot标记根节点，便于布局与渲染识别
- 与编辑器的衔接
  - 视图组件将Plait Board的变更写回节点属性data，保持与编辑器内容同步

```mermaid
erDiagram
ROOT {
string id
boolean isRoot
number width
number height
array points
}
CHILD {
string id
number width
number height
}
ROOT ||--o{ CHILD : "children"
```

**图表来源**
- [data.ts](file://packages/plugin-drawnix/src/extension/data.ts#L1-L212)

**章节来源**
- [data.ts](file://packages/plugin-drawnix/src/extension/data.ts#L1-L212)

### 样式与主题定制
- 样式引入
  - 引入@plait/mind与@plait-board的样式资源，确保渲染一致性
  - 自定义样式覆盖viewport容器尺寸，保证全屏渲染体验
- 主题切换
  - 通过useTheme获取当前主题，动态更新Plait Board主题色模式
  - 支持暗色/彩色两种模式，满足不同阅读偏好

**章节来源**
- [DrawnixView.tsx](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)
- [index.css（样式）](file://packages/plugin-drawnix/src/extension/style/index.css#L1-L4)

### 与Canvas版本对比（MindmapCanvas）
为便于理解差异，补充Canvas版本的MindmapCanvas组件，帮助评估迁移或对比：
- 数据模型：以节点列表形式存储，包含id、label、parentId、x/y等
- 交互：基于Canvas点击选中、增删节点、重置布局
- 适用场景：对节点数量较大、需要自定义布局的场景更友好

**章节来源**
- [mindmap-canvas.tsx](file://packages/plugin-mindmap-canvas/src/nodes/mindmap-canvas.tsx#L1-L51)
- [MindmapCanvasView.tsx](file://packages/plugin-mindmap-canvas/src/views/MindmapCanvasView.tsx#L1-L207)
- [default-data.ts](file://packages/plugin-mindmap-canvas/src/nodes/default-data.ts#L1-L41)

## 依赖关系分析
- 外部依赖
  - @plait/*系列：核心画板、思维导图、绘制、公共能力与布局
  - @plait-board/react-*：React桥接与文本渲染
  - @kn/*：编辑器内核、通用工具与UI组件
- 内部依赖
  - 扩展定义依赖视图组件
  - 视图组件依赖OnlyMind与默认数据
  - 插件装配依赖扩展入口

```mermaid
graph LR
P["@kn/plugin-drawnix"] --> E["@kn/editor"]
P --> C["@kn/common"]
P --> U["@kn/ui"]
P --> PC["@plait/core"]
P --> PM["@plait/mind"]
P --> PD["@plait/draw"]
P --> PG["@plait/common"]
P --> PL["@plait/layouts"]
P --> PR["@plait-board/react-board"]
P --> PT["@plait-board/react-text"]
```

**图表来源**
- [package.json（插件包）](file://packages/plugin-drawnix/package.json#L1-L46)

**章节来源**
- [package.json（插件包）](file://packages/plugin-drawnix/package.json#L1-L46)

## 性能与可扩展性
- 性能特性
  - 仅在主题变化或初次挂载时进行视口适配与主题切换，减少不必要重绘
  - 通过回调驱动数据回写，避免频繁DOM操作
- 可扩展性
  - OnlyMind通过插件组合扩展能力，便于按需启用/替换插件
  - afterInit回调提供对PlaitBoard的直接访问，支持二次开发（如自定义布局、快捷键、导出等）
- 优化建议
  - 对大型思维导图，建议在交互空闲时再触发fitViewport
  - 若需协作编辑，可在onChange中加入节流或去抖，降低写回频率
  - 主题切换时可缓存当前模式，避免重复切换导致的闪烁

[本节为通用指导，无需列出具体文件来源]

## 使用示例
以下示例均以路径引用代替代码片段：

- 创建思维导图
  - 在编辑器中输入“/drawnix”并回车，触发插入命令
  - 参考路径：[扩展装配](file://packages/plugin-drawnix/src/extension/index.tsx#L1-L20)，[节点扩展](file://packages/plugin-drawnix/src/extension/drawnix.ts#L1-L43)

- 编辑思维导图
  - 在思维导图区域内进行节点增删改查、拖拽、缩放等操作
  - 变更通过onChange回写至节点属性，参考路径：[视图组件](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)

- 导出思维导图
  - 当前实现未内置导出功能。建议通过Plait Board提供的导出接口或截图方案实现导出
  - 参考路径：[OnlyMind回调](file://packages/plugin-drawnix/src/extension/only-mind.tsx#L1-L67)

- 导入数据
  - 可将外部思维导图数据转换为initializeData格式，或在afterInit中调用Board API批量写入元素
  - 参考路径：[默认数据结构](file://packages/plugin-drawnix/src/extension/data.ts#L1-L212)，[OnlyMind回调](file://packages/plugin-drawnix/src/extension/only-mind.tsx#L1-L67)

- 协作编辑
  - 插件未内置协同库。可结合编辑器的协作扩展，在onChange中进行增量同步
  - 参考路径：[节点扩展命令](file://packages/plugin-drawnix/src/extension/drawnix.ts#L1-L43)，[视图组件写回](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)

## 故障排查
- 插件未生效
  - 确认插件已正确装配并注册到编辑器扩展体系
  - 参考路径：[插件装配](file://packages/plugin-drawnix/src/index.tsx#L2-L14)，[扩展装配](file://packages/plugin-drawnix/src/extension/index.tsx#L1-L20)

- 无法渲染或样式异常
  - 检查样式资源是否正确引入，确认viewport容器尺寸覆盖
  - 参考路径：[样式引入](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)，[样式覆盖](file://packages/plugin-drawnix/src/extension/style/index.css#L1-L4)

- 主题切换无效
  - 确保useTheme返回值与主题切换逻辑一致，并在afterInit后更新Board主题
  - 参考路径：[主题切换](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)

- 交互无响应
  - 检查readonly状态与编辑器可编辑状态是否冲突
  - 参考路径：[只读控制](file://packages/plugin-drawnix/src/extension/DrawnixView.tsx#L1-L56)，[OnlyMind配置](file://packages/plugin-drawnix/src/extension/only-mind.tsx#L1-L67)

## 结论
Drawnix思维导图插件通过清晰的分层设计与Plait生态的深度集成，实现了在编辑器内的所见即所得思维导图编辑体验。其核心优势在于：
- 以节点扩展+React视图的方式，平滑接入编辑器
- 以OnlyMind聚焦思维导图能力，提供丰富的交互与主题支持
- 通过默认数据与回调机制，实现数据的稳定回写与扩展空间

未来可进一步完善：
- 增加导出与导入能力（如Markdown/Mermaid互转）
- 引入协作编辑与增量同步
- 提供更多布局与样式定制选项