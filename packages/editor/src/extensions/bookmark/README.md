# Bookmark Extension

A Tiptap extension for adding rich bookmark cards to your editor. This extension allows users to create beautiful bookmark cards with URL, title, description, and preview images.

## Features

- 📌 Notion-style inline URL input — paste a link to create a bookmark instantly
- ⚡ Card renders immediately; metadata (title, description, image, favicon) is fetched asynchronously with skeleton loading
- 🖼️ Support for preview images and favicons (with graceful fallbacks)
- 🎨 Refined horizontal card UI with hover actions (refresh, edit, delete)
- 🔗 Click anywhere on the card to open the bookmarked URL
- 📱 Responsive design (preview image hidden on narrow viewports)

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

Click the bookmark icon in the editor toolbar to insert a new bookmark. An inline input appears in place — paste or type a link and press Enter (pasting a valid link commits immediately). Metadata is fetched automatically and fills the card as it loads.

## Bookmark Attributes

- `url` (string): The URL of the bookmarked page (required)
- `title` (string): The title of the bookmark
- `description` (string): A brief description
- `favicon` (string): URL to the favicon image (auto-generated if not provided)
- `image` (string): URL to the preview image

## Keyboard Shortcuts

- `Mod-Shift-K` — insert a new bookmark
- In the inline input: `Enter` to confirm, `Escape` to cancel (an unconfirmed new bookmark is removed)

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
- Metadata fetching via a backend proxy (avoids CORS limitations)
- Support for different card layouts (large cover / compact single-line)
- Batch import from bookmark files
