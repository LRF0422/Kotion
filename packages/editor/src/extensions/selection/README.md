# Selection Extension

A comprehensive selection management extension for the TipTap editor that provides enhanced selection handling, visual feedback, and utility functions.

## Features

### 1. **Enhanced Selection Visualization**
- Visual outline for selected nodes with smooth transitions
- Dark mode support with adaptive colors
- Hover state feedback for better UX

### 2. **Smart Ctrl+A / Command+A Handling**
- Context-aware selection within custom nodes
- Falls back to default behavior when appropriate
- Error handling for edge cases

### 3. **Read-only Mode Protection**
- Prevents all interaction in read-only mode
- Blocks clicks, keypresses, double-clicks, and triple-clicks
- Maintains visual consistency

### 4. **Performance Optimizations**
- Efficient decoration mapping when selection unchanged
- Only recalculates when necessary (selection or document changes)
- Proper cleanup and error handling

### 5. **Node Selection Management**
- Filters out text nodes and paragraphs for cleaner selection
- Prevents ProseMirror mutation observer conflicts
- Maintains node selection integrity in collaborative editing

## API

### Core Functions

#### `getTopLevelNodesFromSelection(selection: Selection, doc: PMNode)`
Gets all top-level block nodes within the current selection, excluding text nodes and paragraphs.

```typescript
import { getTopLevelNodesFromSelection } from '@kn/editor';

const nodes = getTopLevelNodesFromSelection(editor.state.selection, editor.state.doc);
nodes.forEach(({ node, pos }) => {
  console.log(`Node ${node.type.name} at position ${pos}`);
});
```

#### `getDecorations(doc: PMNode, selection: Selection)`
Generates decorations for the current selection with appropriate visual styling.

```typescript
import { getDecorations } from '@kn/editor';

const decorations = getDecorations(editor.state.doc, editor.state.selection);
```

### Plugin Key

Access the selection plugin state:

```typescript
import { selectionPluginKey } from '@kn/editor';

const decorations = selectionPluginKey.getState(editor.state);
```

## Utility Functions

The extension also exports comprehensive utility functions from `utilities/selection.ts`:

### Selection State Queries

```typescript
import {
  isSelectionEmpty,
  isMultiBlockSelection,
  getSelectionText,
  isSelectionAtStart,
  isSelectionAtEnd
} from '@kn/editor';

// Check if selection is empty
if (isSelectionEmpty(editor.state)) {
  console.log('No selection');
}

// Check if selection spans multiple blocks
if (isMultiBlockSelection(editor.state)) {
  console.log('Multi-block selection');
}

// Get selected text
const text = getSelectionText(editor.state);
```

### Node Queries

```typescript
import {
  getNodesInSelection,
  getBlockNodesInSelection,
  getSelectionParent,
  getSelectionAncestor
} from '@kn/editor';

// Get all nodes in selection
const allNodes = getNodesInSelection(editor.state);

// Get only block nodes
const blockNodes = getBlockNodesInSelection(editor.state);

// Get parent node
const parent = getSelectionParent(editor.state);

// Get common ancestor
const ancestor = getSelectionAncestor(editor.state);
```

### Selection Manipulation

```typescript
import {
  selectNode,
  selectRange,
  expandSelectionToParent
} from '@kn/editor';

// Select a specific node
const selection = selectNode(editor.state, nodePos);
if (selection) {
  editor.view.dispatch(editor.state.tr.setSelection(selection));
}

// Select a range
const rangeSelection = selectRange(editor.state, from, to);

// Expand to parent node
const expandedSelection = expandSelectionToParent(editor.state);
```

### Selection Type Checking

```typescript
import {
  isNodeSelection
} from '@kn/editor';

if (isNodeSelection(editor.state.selection)) {
  console.log('Node is selected');
}
```

## Styling

The extension includes default CSS styles that can be customized:

```css
/* Default selection style */
.selected-node {
  outline: 2px solid rgba(12, 102, 228, 0.4);
  outline-offset: 1px;
  border-radius: 4px;
  transition: outline 0.15s ease-in-out;
}

/* Hover state */
.selected-node:hover {
  outline-color: rgba(12, 102, 228, 0.6);
}

/* Dark mode */
.dark .selected-node {
  outline-color: rgba(59, 130, 246, 0.5);
}
```

### Customization

Override the styles in your own CSS:

```css
.selected-node {
  outline: 3px solid your-color;
  outline-offset: 2px;
  /* Your custom styles */
}
```

## Usage in Extensions

Example of using selection utilities in a custom extension:

```typescript
import { Extension } from '@tiptap/core';
import { getBlockNodesInSelection, isSelectionEmpty } from '@kn/editor';

export const MyExtension = Extension.create({
  name: 'myExtension',
  
  addCommands() {
    return {
      processSelection: () => ({ state, dispatch }) => {
        if (isSelectionEmpty(state)) {
          return false;
        }
        
        const blocks = getBlockNodesInSelection(state);
        blocks.forEach(({ node, pos }) => {
          // Process each block
        });
        
        return true;
      }
    }
  }
});
```

## Best Practices

1. **Performance**: Use the provided utility functions instead of re-implementing selection logic
2. **Type Safety**: All functions are fully typed with TypeScript
3. **Error Handling**: Functions include try-catch blocks and return null on errors
4. **Memory**: Decorations are efficiently mapped when unchanged for better performance

## Browser Compatibility

The selection extension works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Troubleshooting

### Selection not visible
Ensure the CSS is imported in your application:
```typescript
import '@kn/editor/styles/editor.css';
```

### Context-aware Ctrl+A not working
The feature only activates when inside custom nodes (not doc or paragraph). This is intentional to preserve default browser behavior for normal text.

### Performance issues
The extension is optimized to only recalculate decorations when necessary. If you're experiencing issues, check for:
- Excessive re-renders in your React components
- Large documents with complex node structures
- Custom plugins that might interfere with selection

## Contributing

When extending this component, ensure:
- All public functions are documented
- Type definitions are accurate
- Error handling is implemented
- Performance implications are considered
- Tests are added for new functionality
