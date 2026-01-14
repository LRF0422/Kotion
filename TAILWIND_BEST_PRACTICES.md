# Tailwind CSS 最佳实践指南

## 问题总结

本项目之前遇到的 Tailwind CSS 样式失效问题，主要原因包括：

1. **content 路径配置不完整** - Tailwind 无法扫描到所有使用类名的文件
2. **safelist 正则表达式错误** - 动态类名没有被正确保护
3. **构建过程缺少 Tailwind 处理** - Rollup 构建时未正确处理 Tailwind CSS
4. **动态类名使用不当** - 模板字符串拼接导致 JIT 编译器无法识别

## 已修复的问题

### 1. 更新了 Tailwind 配置 (packages/ui/tailwind.config.js)

```javascript
content: [
  "./src/**/*.{ts,tsx}",
  // 扫描所有 workspace 包中的 Tailwind 类
  "../../packages/*/src/**/*.{ts,tsx,jsx,js}",
  "../../apps/*/src/**/*.{ts,tsx,jsx,js}",
  "./node_modules/@kn/**/*.{ts,tsx}",
  "./node_modules/streamdown/dist/*.js",
],
```

### 2. 修复了 safelist 配置

```javascript
safelist: [
  {
    // 匹配动态网格列类，如 grid-cols-1, grid-cols-2 等
    pattern: /^grid-cols-(\d+|\[.+\])$/,
  },
  {
    // 匹配动态间距类
    pattern: /^gap-(\d+|\[.+\])$/,
  },
  {
    // 匹配常见的动态工具类
    pattern: /^(w|h|max-w|max-h|min-w|min-h)-(\d+|\[.+\]|full|screen|auto)$/,
  },
],
```

### 3. 更新了 Rollup 配置 (packages/rollup-config/index.js)

```javascript
postcss({
  plugins: [
    tailwindcss(),     // ✅ 添加了 Tailwind 处理
    autoprefixer(),    // ✅ 添加了 autoprefixer
    cssnext(), 
    nested(), 
    postcssCascadeLayers()
  ],
  extensions: [".css"],
  extract: false,
  minimize: true,
}),
```

## 编写代码时的最佳实践

### ✅ 推荐做法

#### 1. 使用完整的类名

```tsx
// ✅ 好 - Tailwind 可以识别
<div className="grid grid-cols-4 gap-4" />
<div className="bg-blue-500 text-white" />
```

#### 2. 使用 `cn()` 辅助函数处理条件类名

```tsx
import { cn } from "@kn/ui/lib/utils";

// ✅ 好 - 使用完整的类名
<div className={cn(
  "flex items-center",
  isActive && "bg-blue-500",
  isDisabled && "opacity-50 cursor-not-allowed"
)} />
```

#### 3. 使用 safelist 处理真正的动态类

```tsx
// 如果必须使用动态值，确保在 safelist 中配置
// 然后可以这样使用：
const cols = props.cols; // 来自 API 或 props
<div className={`grid-cols-${cols}`} />
```

### ❌ 避免的做法

#### 1. 避免字符串拼接构造类名

```tsx
// ❌ 不好 - Tailwind 无法识别
const bgColor = 'blue';
<div className={`bg-${bgColor}-500`} />

// ✅ 改用对象映射
const bgColors = {
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  green: 'bg-green-500',
};
<div className={bgColors[color]} />
```

#### 2. 避免模板字符串动态生成类名

```tsx
// ❌ 不好
<div className={`grid-cols-${dynamicCols}`} />

// ✅ 改用 safelist + 完整类名
// 或者使用固定的类名映射
const gridColsMap = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};
<div className={gridColsMap[cols]} />
```

#### 3. 避免在运行时计算类名

```tsx
// ❌ 不好
const padding = size * 2;
<div className={`p-${padding}`} />

// ✅ 使用内联样式或 CSS 变量
<div style={{ padding: `${size * 2}px` }} />
```

## 开发工作流

### 1. 添加新的 package 时

如果在 `packages/` 或 `apps/` 下创建新的包，确保：

- 新包的 `tailwind.config.js` 使用 preset：
  ```javascript
  module.exports = {
    content: ["./src/**/*.{js,ts,jsx,tsx}"],
    presets: [require("@kn/ui/tailwind.config")],
  };
  ```

### 2. 需要使用真正动态的类时

如果确实需要使用动态类名（如从 API 获取的值），需要：

1. 在 `packages/ui/tailwind.config.js` 的 `safelist` 中添加对应的正则：
   ```javascript
   safelist: [
     {
       pattern: /^your-dynamic-class-pattern$/,
     },
   ],
   ```

2. 或者使用完整类名映射，避免动态拼接

### 3. 样式不生效的排查步骤

如果遇到样式不生效：

1. **检查是否使用了动态类名拼接** - 搜索代码中的 `` className={`...${variable}...`} ``
2. **重新构建** - 运行 `pnpm build` 重新构建受影响的包
3. **检查 content 配置** - 确保文件路径在 Tailwind 配置的 `content` 中
4. **使用 safelist** - 如果必须使用动态类，添加到 safelist

### 4. 构建和开发命令

```bash
# 构建所有包
pnpm build

# 开发模式（支持热更新）
pnpm dev

# 单独构建某个包
pnpm build:core
pnpm build:ui
```

## 性能优化建议

1. **尽量避免使用 safelist** - safelist 会增加最终 CSS 文件大小
2. **使用 JIT 模式的优势** - Tailwind 3+ 默认使用 JIT，只生成使用的类
3. **合理组织 content 配置** - 只扫描必要的文件路径

## 相关文档

- [Tailwind CSS Content Configuration](https://tailwindcss.com/docs/content-configuration)
- [Tailwind CSS Safelist](https://tailwindcss.com/docs/content-configuration#safelisting-classes)
- [Tailwind CSS JIT Mode](https://tailwindcss.com/docs/upgrade-guide#migrating-to-the-jit-engine)

## 常见问题 FAQ

### Q: 为什么有些样式只在重启项目后才生效？

A: 这通常是因为：
- 使用了动态类名拼接，Tailwind 无法在编译时识别
- content 配置不完整，某些文件没有被扫描
- 构建缓存问题，需要清除缓存重新构建

### Q: 如何调试 Tailwind 是否正确扫描了文件？

A: 可以在开发模式下检查浏览器开发者工具中的 CSS，看是否包含你使用的类。或者临时在 `tailwind.config.js` 中添加日志：

```javascript
module.exports = {
  content: {
    files: ["./src/**/*.{ts,tsx}"],
    extract: {
      // 添加自定义提取器来调试
      tsx: (content) => {
        console.log('Scanning file...');
        return content.match(/className="[^"]*"/g);
      }
    }
  }
}
```

### Q: 生产构建的 CSS 文件太大怎么办？

A: 
1. 检查是否 safelist 包含了太多类
2. 确保 content 配置只扫描必要的文件
3. 使用 PurgeCSS 的 `blocklist` 移除不需要的类
