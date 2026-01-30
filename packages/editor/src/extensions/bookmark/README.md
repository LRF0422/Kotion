# Bookmark Extension

A Tiptap extension for adding rich bookmark cards to your editor. This extension allows users to create beautiful bookmark cards with URL, title, description, and preview images.

## Features

- 📌 Create bookmark cards with URL, title, and description
- 🖼️ Support for preview images and favicons
- ✏️ Editable bookmark properties
- 🎨 Beautiful card-style UI with hover effects
- 🔗 Click to open bookmarked URLs
- 🗑️ Delete and edit functionality
- 📱 Responsive design

## Installation

The Bookmark extension is already registered in the editor's extension system.

## Usage

### Programmatically Insert a Bookmark

```typescript
editor.commands.insertBookmark({
  url: 'https://example.com',
  title: 'Example Website',
  description: 'This is an example bookmark',
});
```

### Using the Toolbar

Click the bookmark icon in the editor toolbar to insert a new bookmark. A dialog will appear where you can enter the bookmark details.

## Bookmark Attributes

- `url` (string): The URL of the bookmarked page (required)
- `title` (string): The title of the bookmark
- `description` (string): A brief description
- `favicon` (string): URL to the favicon image (auto-generated if not provided)
- `image` (string): URL to the preview image

## Keyboard Shortcuts

Currently, no keyboard shortcuts are assigned. You can add them by extending the extension configuration.

## Styling

The bookmark component uses Tailwind CSS classes and respects your application's theme (light/dark mode).

## Examples

### Simple Bookmark

```typescript
editor.commands.insertBookmark({
  url: 'https://github.com',
  title: 'GitHub',
});
```

### Full Bookmark with Image

```typescript
editor.commands.insertBookmark({
  url: 'https://github.com',
  title: 'GitHub',
  description: 'Where the world builds software',
  image: 'https://github.githubassets.com/images/modules/open_graph/github-logo.png',
});
```

## Implementation Details

The bookmark extension consists of:
- `bookmark.ts` - The Tiptap node definition
- `bookmark-view.tsx` - The React component for rendering bookmarks
- `menu/menu.tsx` - The toolbar button component
- `index.tsx` - The extension export

## Future Enhancements

Potential improvements:
- Auto-fetch metadata from URLs (title, description, image)
- Support for different card layouts
- Keyboard shortcuts for inserting bookmarks
- Batch import from bookmark files
