# 📚 Knowledge Repo

A powerful collaborative knowledge management platform with rich text editing, AI-powered features, and extensive plugin ecosystem. Built with modern web technologies and real-time collaboration capabilities.

## ✨ Features

### 🎯 Core Capabilities
- **Rich Text Editor** - Powered by Tiptap with collaborative editing support
- **Real-time Collaboration** - Multi-user editing with Hocuspocus backend
- **Plugin Architecture** - Extensible plugin system for custom functionality
- **AI Integration** - AI-powered text generation, image creation, and content transformation
- **Multi-dimensional Tables** - Spreadsheet-like tables with multiple view types (Table, Kanban, Gallery)
- **Visual Diagramming** - Support for Excalidraw, DrawIO, Mermaid, and mind maps
- **File Management** - Built-in file manager for document organization
- **Block References** - Cross-document block linking and embedding
- **Internationalization** - Full i18n support for multiple languages

### 🔌 Available Plugins

#### Data & Content
- **Bitable** - Multi-dimensional tables with views (Table, Kanban, Gallery, Gantt)
- **Database** - Database integration and management
- **File Manager** - Document and file organization system
- **Block Reference** - Cross-reference blocks across documents

#### AI & Automation
- **AI Plugin** - Text generation, image creation, content transformation, and chat interface
- **Weaver OA** - Enterprise workflow integration

#### Visualization & Diagramming
- **Excalidraw** - Hand-drawn style diagrams
- **DrawIO** - Professional diagramming tool
- **DrawIO v2** - Enhanced DrawIO integration
- **Drawnix** - Alternative drawing solution
- **Mermaid** - Text-based diagram generation
- **Mindmap Canvas** - Interactive mind mapping

#### Core Features
- **Main Plugin** - Core application features and navigation
- **Editor** - Enhanced text editing capabilities
- **UI Components** - Shared shadcn/ui component library

## 📦 Technology Stack

### Frontend
- **React 18** - Modern React with hooks and concurrent features
- **TypeScript 5** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Next.js** - React framework for landing pages
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - High-quality React components
- **Tiptap** - Headless editor framework
- **Hocuspocus** - Real-time collaboration backend

### Build & Infrastructure
- **Turborepo** - High-performance monorepo build system
- **pnpm** - Fast, disk space efficient package manager
- **Rollup** - Module bundler for libraries
- **Docker** - Containerization for deployment

### AI Integration
- **DeepSeek AI** - AI text generation
- **Vercel AI SDK** - Streaming AI responses
- **Image Generation** - AI-powered image creation

## 📚 Project Structure

```
knowledge-repo/
├── apps/
│   ├── vite/                      # Main Vite application
│   ├── landing-page/              # Next.js landing page
│   └── landing-page-vite/         # Vite-based landing page
├── packages/
│   ├── core/                     # Core application logic
│   ├── editor/                   # Tiptap editor integration
│   ├── common/                   # Shared utilities and types
│   ├── ui/                       # shadcn/ui components
│   ├── icon/                     # Icon library
│   ├── plugin-main/              # Main plugin features
│   ├── plugin-ai/                # AI capabilities
│   ├── plugin-bitable/           # Multi-dimensional tables
│   ├── plugin-file-manager/      # File management
│   ├── plugin-block-reference/   # Block linking
│   ├── plugin-database/          # Database integration
│   ├── plugin-excalidraw/        # Excalidraw diagrams
│   ├── plugin-drawio/            # DrawIO diagrams
│   ├── plugin-drawio-v2/         # DrawIO v2
│   ├── plugin-drawnix/           # Drawnix drawing
│   ├── plugin-mermaid/           # Mermaid diagrams
│   ├── plugin-mindmap-canvas/    # Mind mapping
│   ├── plugin-weaver-oa/         # Weaver OA integration
│   ├── eslint-config/            # Shared ESLint config
│   ├── typescript-config/        # Shared TypeScript config
│   └── rollup-config/            # Shared Rollup config
└── ...
```

## 👥 Prerequisites

Make sure you have the following installed:

- **Node.js** (version 18 or higher) - [Download](https://nodejs.org/en/download/)
- **pnpm** (version 9 or higher) - [Installation Guide](https://pnpm.io/installation)

## 🛠️ Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/knowledge-repo.git
   cd knowledge-repo
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Build all packages:**

   ```bash
   pnpm build
   ```

4. **Start development:**

   ```bash
   pnpm dev
   ```

5. **Start collaboration server (optional):**

   ```bash
   pnpm room-server
   ```

## 💻 Development

### Build Commands

```bash
# Build all packages
pnpm build

# Build specific packages
pnpm build:core           # Core package
pnpm build:editor         # Editor package
pnpm build:ui             # UI components
pnpm build:ai             # AI plugin
pnpm build:bitable        # Bitable plugin
pnpm build:file-manager   # File manager plugin
pnpm build:app            # Main application
pnpm build:landing        # Landing page
```

### Development Commands

```bash
# Start all apps in dev mode
pnpm dev

# Start collaboration server
pnpm room-server

# Lint all packages
pnpm lint

# Format code
pnpm format
```

### Adding UI Components

Add new shadcn/ui components to the shared library:

```bash
# Example: Add a new component (card, button, tabs, etc.)
pnpm ui:add card
pnpm ui:add button
pnpm ui:add tabs
```

### Clean Commands

```bash
# Clean all built packages
pnpm clean:packages

# Clean all node_modules
pnpm clean:lib
```

## 🐳 Docker Deployment

Build Docker images for production:

```bash
# Build main application
pnpm build:appDocker

# Build landing page
pnpm build:landingDocker
```

## 🎯 Plugin Development

### Creating a New Plugin

1. Create a new package in `packages/`:

   ```bash
   mkdir packages/plugin-yourplugin
   cd packages/plugin-yourplugin
   ```

2. Set up package structure:

   ```
   plugin-yourplugin/
   ├── src/
   │   ├── index.tsx              # Plugin entry
   │   └── components/            # Plugin components
   ├── package.json
   ├── tsconfig.json
   ├── rollup.config.mjs
   └── README.md
   ```

3. Define your plugin:

   ```typescript
   import { Plugin } from '@kn/core';
   
   export const yourPlugin: Plugin = {
     name: 'yourplugin',
     extensions: [
       // Your Tiptap extensions
     ],
     components: [
       // Your React components
     ]
   };
   ```

4. Register in the application:

   ```typescript
   import { yourPlugin } from '@kn/plugin-yourplugin';
   import { App } from '@kn/core';
   
   <App plugins={[yourPlugin]} />
   ```

### Plugin Best Practices

- Use TypeScript for type safety
- Implement i18n for multi-language support
- Follow the existing plugin structure
- Add comprehensive README documentation
- Use shared UI components from `@kn/ui`
- Implement proper error handling
- Add unit tests for complex logic

## 🌐 Environment Configuration

Create a `.env.local` file for local development:

```bash
# AI Configuration
VITE_AI_IMAGE_API_KEY=your_api_key_here

# Other configurations...
```

## 📖 Documentation

For detailed plugin documentation, see:

- [Bitable Plugin](./packages/plugin-bitable/README.md) - Multi-dimensional tables
- [AI Plugin](./packages/plugin-ai/README.md) - AI-powered features
- [File Manager](./packages/plugin-file-manager/OPTIMIZATION.md) - File management
- [Block Reference](./packages/plugin-block-reference/README.md) - Block linking

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow TypeScript best practices
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR
- Follow the existing code style

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🚀 Roadmap

### Completed ✓
- [x] Rich text editor with Tiptap
- [x] Real-time collaboration
- [x] AI text and image generation
- [x] Multi-dimensional tables (Table, Kanban, Gallery views)
- [x] Multiple diagramming tools
- [x] File management system
- [x] Block reference system
- [x] Internationalization

### In Progress 🚧
- [ ] Gantt chart view for Bitable
- [ ] Calendar view for Bitable
- [ ] Timeline view for Bitable
- [ ] Advanced filtering and sorting
- [ ] Form view for data collection
- [ ] Mobile responsive optimization

### Planned 💡
- [ ] Offline mode support
- [ ] Advanced permissions system
- [ ] Template marketplace
- [ ] API documentation
- [ ] Plugin marketplace
- [ ] Desktop application (Electron)
- [ ] Mobile applications (React Native)

## ❓ Support

If you encounter any issues or have questions:

- Open an issue on GitHub
- Check existing documentation
- Review plugin-specific README files

## 🎉 Acknowledgments

- Built with [Turborepo](https://turbo.build/repo)
- UI components from [shadcn/ui](https://ui.shadcn.com)
- Editor powered by [Tiptap](https://tiptap.dev)
- Inspired by modern knowledge management tools

---

**Made with ❤️ by the Knowledge Repo team**
