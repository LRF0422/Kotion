# PDF Export功能

## 概述

此模块提供了将Tiptap编辑器内容导出为PDF文件的功能。它使用html2canvas将编辑器内容转换为高清图像，然后使用jsPDF将图像添加到PDF文档中。支持中文内容的正确渲染，并保持与浏览器显示一致的样式。

## 主要功能

- 将编辑器内容导出为高质量PDF（3倍分辨率）
- 支持多种页面格式（A3, A4, A5, Letter, Legal）
- 支持横向和纵向布局
- 可自定义边距
- 支持添加页眉、页脚和水印
- 支持多页文档
- 支持中文内容正确显示
- 保持浏览器显示的样式一致性
- 自动隐藏固定定位元素（如ToC按钮）
- PNG格式输出，确保文本清晰度

## 最新改进 (v2)

### 架构改进
- ✅ **直接捕获原始元素** - 不再克隆元素，避免样式丢失
- ✅ **保留所有计算样式** - 完美匹配浏览器显示
- ✅ **智能元素过滤** - 自动隐藏固定定位的UI元素（按钮、ToC等）

### 输出质量提升
- ✅ 分辨率提升到 3x (2850px 宽度用于 A4)
- ✅ 使用 PNG 替代 JPEG，文本更清晰
- ✅ 完整保留表格、列表等复杂布局

### 用户体验改进
- ✅ 导出过程中显示加载提示
- ✅ 更快的导出速度（无需 DOM 操作）
- ✅ 支持中文内容正确显示

## API

### exportToPDF(view: EditorView, options: PDFExportOptions = {})
将编辑器内容导出为PDF的便捷函数。

#### 参数
- `view`: Tiptap编辑器视图实例
- `options`: 导出选项

#### 选项 (PDFExportOptions)
- `filename`: 输出文件名，默认为 'document.pdf'
- `format`: 页面格式 ('a3' | 'a4' | 'a5' | 'letter' | 'legal')，默认为 'a4'
- `orientation`: 页面方向 ('portrait' | 'landscape')，默认为 'portrait'
- `margin`: 边距（毫米），默认为 10
- `includeImages`: 是否包含图片，默认为 true
- `includeStyles`: 是否包含样式，默认为 true
- `quality`: 图像质量 (0-1)，默认为 1.0
- `watermark`: 水印文字
- `header`: 页眉文字
- `footer`: 页脚文字

### PDFExporter 类
提供静态方法 `export` 来执行PDF导出。

## 使用示例

```typescript
import { exportToPDF } from '@kn/editor';

// 基本用法
exportToPDF(editor.view, {
  filename: 'my-document.pdf',
  format: 'a4',
  orientation: 'portrait',
  margin: 10
});

// 高级用法
exportToPDF(editor.view, {
  filename: 'report.pdf',
  format: 'a4',
  orientation: 'portrait',
  margin: 15,
  quality: 0.9,
  watermark: 'CONFIDENTIAL',
  header: 'Company Report',
  footer: '© 2023 Company Name'
});
```

## 注意事项

- 由于使用了html2canvas，某些CSS属性可能无法正确渲染
- 对于大型文档，导出过程可能需要一些时间
- 图像密集型内容可能会消耗较多内存
- 中文内容需要系统或浏览器支持相应的中文字体才能正确显示