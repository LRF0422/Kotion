# Drawio V2 Plugin

Enhanced Drawio diagram plugin for knowledge-repo system.

## Features

- 📊 **Interactive Diagram Editor**: Embedded Drawio editor for creating and editing diagrams
- 🎨 **Theme Support**: Automatically adapts to light/dark theme
- 💾 **Auto-save**: Diagrams are saved as embedded PNG with XML data
- ⌨️ **Slash Commands**: Quick insertion using `/drawio-v2` or `/绘图v2`
- 🖱️ **Double-click Edit**: Double-click on existing diagrams to edit
- 🚀 **Empty State**: User-friendly placeholder when no diagram exists

## Installation

This plugin is part of the knowledge-repo monorepo. To use it:

1. Install dependencies from the root:
```bash
pnpm install
```

2. Build the plugin:
```bash
cd packages/plugin-drawio-v2
pnpm build
```

## Usage

### Insert a Diagram

Use one of the slash commands in the editor:
- `/drawio-v2` - English command
- `/绘图v2` - Chinese command

### Edit a Diagram

Double-click on an existing diagram to open the editor.

### Features in the Editor

- Full Drawio functionality embedded
- Save your work using Ctrl+S (Cmd+S on Mac)
- Exit the editor by clicking outside or closing the dialog

## Technical Details

### Components

- **DrawioV2Extension**: Main extension wrapper with slash command configuration
- **DrawioV2**: TipTap node definition for the diagram block
- **DrawioView**: React component for rendering and editing diagrams

### Dependencies

- `@kn/common` - Common utilities and plugin base
- `@kn/core` - Core functionality
- `@kn/editor` - Editor integration
- `@kn/icon` - Icon components
- `@kn/ui` - UI components (Dialog, EmptyState, etc.)

### Data Format

Diagrams are stored as base64-encoded PNG images with embedded XML data, allowing:
- Visual preview without loading the editor
- Complete diagram data preservation
- Portable format that works across systems

## Development

### File Structure

```
plugin-drawio-v2/
├── src/
│   ├── extension/
│   │   ├── DrawioView.tsx    # React component for rendering
│   │   ├── drawio.ts         # TipTap node definition
│   │   └── index.tsx         # Extension wrapper
│   └── index.tsx             # Plugin entry point
├── package.json
├── tsconfig.json
├── rollup.config.mjs
└── README.md
```

### Commands

- `pnpm build` - Build the plugin
- `pnpm test` - Run tests (not yet implemented)

## License

ISC
