# Weaver OA Plugin (泛微OA插件)

A comprehensive integration plugin for Weaver OA (泛微OA) system, providing seamless document management, workflow automation, and collaboration features within the Knowledge management system.

## Features (功能特性)

### 📄 Document Integration (文档集成)
- Embed OA documents directly in your pages
- Real-time synchronization with Weaver OA
- Quick access to document links
- Support for various document types

### 🔄 Workflow Integration (工作流集成)
- Display workflow status and progress
- Track workflow stages
- Quick navigation to workflow details
- Visual workflow representation

### 📝 Form Embedding (表单嵌入)
- Embed interactive OA forms
- Direct form submission from editor
- Form data synchronization
- Support for various form types

### ✅ Approval Process Tracking (审批流程跟踪)
- Monitor approval status
- Track approval history
- View current approvers
- Quick approval actions

## Installation (安装)

```bash
# Install dependencies
pnpm install

# Build the plugin
pnpm build
```

## Usage (使用方法)

### In Editor (在编辑器中使用)

Use slash commands to insert Weaver OA content:

- `/weaver-doc` - Insert OA Document (插入OA文档)
- `/weaver-workflow` - Insert Workflow (插入工作流)
- `/weaver-form` - Embed Form (嵌入表单)
- `/weaver-approval` - Insert Approval Process (插入审批流程)

### Configuration (配置)

After inserting a Weaver OA element, you need to configure:

1. **Title**: Display name for the element
2. **ID**: The corresponding ID in Weaver OA system
   - Document ID for documents
   - Workflow ID for workflows
   - Form ID for forms
   - Approval ID for approval processes

### Features (功能)

Each embedded element provides:

- 🔄 **Sync**: Synchronize with latest data from Weaver OA
- ⚙️ **Settings**: Configure element properties
- 🔗 **Open in OA**: Quick link to open in Weaver OA system

## Component Types (组件类型)

### Document (文档)
Displays linked OA documents with metadata and quick access.

```tsx
{
  type: "document",
  documentId: "DOC12345",
  title: "Project Proposal"
}
```

### Workflow (工作流)
Shows workflow progress and current status.

```tsx
{
  type: "workflow",
  workflowId: "WF67890",
  title: "Approval Workflow"
}
```

### Form (表单)
Embeds interactive OA forms.

```tsx
{
  type: "form",
  formId: "FORM456",
  title: "Request Form"
}
```

### Approval (审批)
Tracks approval process status.

```tsx
{
  type: "approval",
  approvalId: "APP789",
  title: "Budget Approval"
}
```

## API Integration (API集成)

Configure your Weaver OA API endpoint in the plugin settings:

```typescript
const weaverOA = new WeaverOAPlugin({
  status: "ACTIVE",
  name: "WeaverOA",
  apiEndpoint: "https://your-weaver-oa.com/api",
  syncInterval: 30000, // 30 seconds
});
```

## Localization (国际化)

The plugin supports both Chinese and English:

- Chinese (中文): Default interface language
- English: Full English translation available

## Development (开发)

### Project Structure (项目结构)

```
plugin-weaver-oa/
├── src/
│   ├── extension/
│   │   ├── index.tsx              # Extension configuration
│   │   └── weaver-oa-node.tsx     # Node definition
│   ├── components/
│   │   └── WeaverOAComponent.tsx  # React component
│   └── index.tsx                  # Plugin entry
├── package.json
├── tsconfig.json
├── rollup.config.mjs
└── README.md
```

### Building (构建)

```bash
# Development build
pnpm build

# Watch mode
pnpm build --watch
```

## Requirements (依赖要求)

- Node.js >= 16
- React >= 18
- Weaver OA API access

## License

MIT

## Author

Knowledge Team

## Contributing (贡献)

Contributions are welcome! Please feel free to submit a Pull Request.

## Support (支持)

For issues and questions, please open an issue on GitHub.
