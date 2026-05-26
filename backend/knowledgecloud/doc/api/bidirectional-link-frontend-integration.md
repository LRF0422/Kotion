# Bidirectional Link Frontend Integration Guide

> Target: React + Tiptap Frontend
> Backend Service: knowledge-wiki
> Last Updated: 2026-02-07

---

## Table of Contents

1. [Overview](#1-overview)
2. [Link Markup Specification](#2-link-markup-specification)
3. [API Reference](#3-api-reference)
4. [Tiptap Extension Implementation](#4-tiptap-extension-implementation)
5. [React Component Examples](#5-react-component-examples)
6. [Complete Integration Flow](#6-complete-integration-flow)

---

## 1. Overview

### 1.1 Feature Description

Bidirectional linking allows users to:
- Create **page-to-page** links using `[[Page Title]]` syntax
- Create **page-to-block** links using `((block-id))` syntax
- View **backlinks** (who references this page/block) in the UI

### 1.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ Tiptap      │    │ Link Picker │    │ Backlinks Panel │  │
│  │ Editor      │───▶│ Modals      │    │ Component       │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
└────────────┬────────────────────────────────────┬───────────┘
             │ POST /space/page                   │ GET /backlinks
             ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                        Backend                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ Page Save   │───▶│ Link Parser │───▶│ wiki_link Table │  │
│  │ & Publish   │    │ (on publish)│    │ (index)         │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Link Markup Specification

### 2.1 Page Link

| Item | Value |
|------|-------|
| Syntax | `[[Page Title]]` |
| Example | `[[Getting Started Guide]]` |
| Regex (backend) | `\[\[([^\]]+)\]\]` |
| Resolution | By title within same space |

### 2.2 Block Link

| Item | Value |
|------|-------|
| Syntax | `((block-id))` |
| Example | `((a1b2c3d4-5678-90ab-cdef))` |
| Regex (backend) | `\(\(([^)]+)\)\)` |
| Resolution | By block id |

### 2.3 Important

The **actual text content** saved to backend must contain these patterns literally.

```
✅ Correct: "See [[My Page]] for details"
❌ Wrong:   "See My Page for details" (with hidden metadata only)
```

---

## 3. API Reference

### 3.1 Page Backlinks

Get all pages/blocks that link to a specific page.

```
GET /knowledge-wiki/space/page/{pageId}/backlinks
```

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| pageId | Long | Yes | Target page ID |

**Response:**

```json
{
  "code": 200,
  "success": true,
  "data": [
    {
      "sourceType": "PAGE",
      "sourceId": "123456",
      "sourcePageId": 123456,
      "sourcePageTitle": "Introduction",
      "sourceBlockId": null,
      "snippet": "...refer to [[Target Page]] for more...",
      "linkKind": "NORMAL",
      "sourcePageIcon": {
        "type": "EMOJI",
        "icon": "📄"
      }
    },
    {
      "sourceType": "BLOCK",
      "sourceId": "block-uuid-here",
      "sourcePageId": 789012,
      "sourcePageTitle": "Another Page",
      "sourceBlockId": "block-uuid-here",
      "snippet": "...mentioned in [[Target Page]] above...",
      "linkKind": "NORMAL",
      "sourcePageIcon": null
    }
  ],
  "msg": "success"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| sourceType | String | `PAGE` or `BLOCK` |
| sourceId | String | Page ID (as string) or Block ID |
| sourcePageId | Long | Page containing the link |
| sourcePageTitle | String | Title of source page |
| sourceBlockId | String | Block ID (if source is a block) |
| snippet | String | Text snippet around the link |
| linkKind | String | Link type: `NORMAL`, `MENTION`, `EMBED` |
| sourcePageIcon | Object | Icon of source page (nullable) |

---

### 3.2 Block Backlinks

Get all pages/blocks that link to a specific block.

```
GET /knowledge-wiki/space/block/{blockId}/backlinks
```

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| blockId | String | Yes | Target block ID |

**Response:**

Same structure as page backlinks.

```json
{
  "code": 200,
  "success": true,
  "data": [
    {
      "sourceType": "PAGE",
      "sourceId": "123456",
      "sourcePageId": 123456,
      "sourcePageTitle": "Overview",
      "sourceBlockId": null,
      "snippet": "...see ((target-block-id)) for...",
      "linkKind": "NORMAL",
      "sourcePageIcon": null
    }
  ],
  "msg": "success"
}
```

---

### 3.3 Search Pages (for link picker)

Search pages by title within a space.

```
GET /knowledge-wiki/space/{spaceId}/page/tree?searchValue={query}
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| spaceId | Long | Yes | Current space ID |
| searchValue | String | No | Search keyword |

**Response:**

```json
{
  "code": 200,
  "success": true,
  "data": [
    {
      "id": 123456,
      "name": "Getting Started",
      "parentId": 0,
      "children": []
    }
  ]
}
```

---

### 3.4 Search Blocks (for block picker)

Query blocks within a space or page.

```
GET /knowledge-wiki/space/page/blocks?spaceId={spaceId}&pageId={pageId}&type={type}
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| spaceId | Long | No | Filter by space |
| pageId | Long | No | Filter by page |
| type | String | No | Block type filter |

**Response:**

```json
{
  "code": 200,
  "success": true,
  "data": {
    "records": [
      {
        "id": "block-uuid",
        "pageId": 123456,
        "type": "paragraph",
        "content": [...]
      }
    ],
    "total": 10,
    "current": 1,
    "size": 20
  }
}
```

---

## 4. Tiptap Extension Implementation

### 4.1 Page Link Mark

```typescript
// extensions/PageLink.ts
import { Mark, mergeAttributes } from '@tiptap/core'

export interface PageLinkAttributes {
  pageId: number | null
  title: string | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageLink: {
      setPageLink: (attrs: { pageId: number; title: string }) => ReturnType
      unsetPageLink: () => ReturnType
    }
  }
}

export const PageLink = Mark.create({
  name: 'pageLink',

  addAttributes() {
    return {
      pageId: { default: null },
      title: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-page-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-page-link': 'true',
        'data-page-id': HTMLAttributes.pageId,
        class: 'wiki-page-link',
        style: 'color: #1890ff; cursor: pointer; text-decoration: underline;',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setPageLink:
        ({ pageId, title }) =>
        ({ chain }) => {
          // IMPORTANT: Insert the [[Title]] pattern for backend parsing
          return chain()
            .insertContent({
              type: 'text',
              text: `[[${title}]]`,
              marks: [{ type: this.name, attrs: { pageId, title } }],
            })
            .run()
        },
      unsetPageLink:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    }
  },
})
```

### 4.2 Block Link Mark

```typescript
// extensions/BlockLink.ts
import { Mark, mergeAttributes } from '@tiptap/core'

export interface BlockLinkAttributes {
  blockId: string | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockLink: {
      setBlockLink: (attrs: { blockId: string }) => ReturnType
      unsetBlockLink: () => ReturnType
    }
  }
}

export const BlockLink = Mark.create({
  name: 'blockLink',

  addAttributes() {
    return {
      blockId: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-block-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-block-link': 'true',
        'data-block-id': HTMLAttributes.blockId,
        class: 'wiki-block-link',
        style: 'color: #722ed1; cursor: pointer; background: #f9f0ff; padding: 0 4px; border-radius: 3px;',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setBlockLink:
        ({ blockId }) =>
        ({ chain }) => {
          // IMPORTANT: Insert the ((blockId)) pattern for backend parsing
          return chain()
            .insertContent({
              type: 'text',
              text: `((${blockId}))`,
              marks: [{ type: this.name, attrs: { blockId } }],
            })
            .run()
        },
      unsetBlockLink:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    }
  },
})
```

### 4.3 Register Extensions

```typescript
// editor.ts
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { PageLink } from './extensions/PageLink'
import { BlockLink } from './extensions/BlockLink'

export function useWikiEditor(initialContent?: any) {
  return useEditor({
    extensions: [
      StarterKit,
      PageLink,
      BlockLink,
    ],
    content: initialContent,
  })
}
```

---

## 5. React Component Examples

### 5.1 API Service

```typescript
// services/linkService.ts
import request from '@/utils/request' // your axios wrapper

export interface BacklinkVO {
  sourceType: 'PAGE' | 'BLOCK'
  sourceId: string
  sourcePageId: number
  sourcePageTitle: string
  sourceBlockId: string | null
  snippet: string
  linkKind: string
  sourcePageIcon: { type: string; icon: string } | null
}

export interface PageTreeNode {
  id: number
  name: string
  parentId: number
  children?: PageTreeNode[]
}

// Get backlinks for a page
export async function getPageBacklinks(pageId: number): Promise<BacklinkVO[]> {
  const res = await request.get(`/knowledge-wiki/space/page/${pageId}/backlinks`)
  return res.data || []
}

// Get backlinks for a block
export async function getBlockBacklinks(blockId: string): Promise<BacklinkVO[]> {
  const res = await request.get(`/knowledge-wiki/space/block/${blockId}/backlinks`)
  return res.data || []
}

// Search pages for link picker
export async function searchPages(spaceId: number, query?: string): Promise<PageTreeNode[]> {
  const res = await request.get(`/knowledge-wiki/space/${spaceId}/page/tree`, {
    params: { searchValue: query },
  })
  return res.data || []
}
```

### 5.2 Page Link Picker Modal

```tsx
// components/PageLinkPicker.tsx
import React, { useState, useEffect } from 'react'
import { Modal, Input, List, Empty } from 'antd'
import { searchPages, PageTreeNode } from '@/services/linkService'

interface Props {
  visible: boolean
  spaceId: number
  onSelect: (page: { id: number; title: string }) => void
  onCancel: () => void
}

export const PageLinkPicker: React.FC<Props> = ({
  visible,
  spaceId,
  onSelect,
  onCancel,
}) => {
  const [query, setQuery] = useState('')
  const [pages, setPages] = useState<PageTreeNode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (visible && spaceId) {
      setLoading(true)
      searchPages(spaceId, query)
        .then(setPages)
        .finally(() => setLoading(false))
    }
  }, [visible, spaceId, query])

  const flattenPages = (nodes: PageTreeNode[]): PageTreeNode[] => {
    const result: PageTreeNode[] = []
    const traverse = (list: PageTreeNode[]) => {
      list.forEach((node) => {
        result.push(node)
        if (node.children?.length) traverse(node.children)
      })
    }
    traverse(nodes)
    return result
  }

  return (
    <Modal
      title="Insert Page Link"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={480}
    >
      <Input.Search
        placeholder="Search pages..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 16 }}
        allowClear
      />

      <List
        loading={loading}
        dataSource={flattenPages(pages)}
        locale={{ emptyText: <Empty description="No pages found" /> }}
        style={{ maxHeight: 400, overflow: 'auto' }}
        renderItem={(page) => (
          <List.Item
            onClick={() => onSelect({ id: page.id, title: page.name })}
            style={{ cursor: 'pointer' }}
            className="hover:bg-gray-50"
          >
            <List.Item.Meta title={page.name} />
          </List.Item>
        )}
      />
    </Modal>
  )
}
```

### 5.3 Backlinks Panel

```tsx
// components/BacklinksPanel.tsx
import React, { useState, useEffect } from 'react'
import { Card, List, Typography, Tag, Empty, Spin } from 'antd'
import { LinkOutlined } from '@ant-design/icons'
import { getPageBacklinks, BacklinkVO } from '@/services/linkService'
import { useNavigate } from 'react-router-dom'

interface Props {
  pageId: number
}

export const BacklinksPanel: React.FC<Props> = ({ pageId }) => {
  const [backlinks, setBacklinks] = useState<BacklinkVO[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (pageId) {
      setLoading(true)
      getPageBacklinks(pageId)
        .then(setBacklinks)
        .catch(() => setBacklinks([]))
        .finally(() => setLoading(false))
    }
  }, [pageId])

  const handleClick = (link: BacklinkVO) => {
    // Navigate to source page
    navigate(`/wiki/page/${link.sourcePageId}`)
  }

  if (loading) {
    return <Spin />
  }

  if (!backlinks.length) {
    return null // Hide panel when no backlinks
  }

  return (
    <Card
      title={
        <span>
          <LinkOutlined /> Backlinks ({backlinks.length})
        </span>
      }
      size="small"
      style={{ marginTop: 24 }}
    >
      <List
        dataSource={backlinks}
        renderItem={(link) => (
          <List.Item
            onClick={() => handleClick(link)}
            style={{ cursor: 'pointer', padding: '8px 0' }}
          >
            <List.Item.Meta
              avatar={
                link.sourcePageIcon ? (
                  <span style={{ fontSize: 20 }}>{link.sourcePageIcon.icon}</span>
                ) : (
                  <span style={{ fontSize: 20 }}>📄</span>
                )
              }
              title={
                <span>
                  {link.sourcePageTitle}
                  {link.sourceType === 'BLOCK' && (
                    <Tag color="purple" style={{ marginLeft: 8 }}>
                      Block
                    </Tag>
                  )}
                </span>
              }
              description={
                <Typography.Text
                  type="secondary"
                  ellipsis
                  style={{ fontSize: 12 }}
                >
                  {link.snippet}
                </Typography.Text>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  )
}
```

### 5.4 Editor with Link Triggers

```tsx
// components/WikiEditor.tsx
import React, { useState, useCallback } from 'react'
import { EditorContent } from '@tiptap/react'
import { useWikiEditor } from '@/editor'
import { PageLinkPicker } from './PageLinkPicker'
import { BlockLinkPicker } from './BlockLinkPicker'

interface Props {
  spaceId: number
  initialContent?: any
  onChange?: (content: any) => void
}

export const WikiEditor: React.FC<Props> = ({
  spaceId,
  initialContent,
  onChange,
}) => {
  const [showPagePicker, setShowPagePicker] = useState(false)
  const [showBlockPicker, setShowBlockPicker] = useState(false)

  const editor = useWikiEditor(initialContent)

  // Listen for [[ and (( triggers
  React.useEffect(() => {
    if (!editor) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const { from } = editor.state.selection
      const textBefore = editor.state.doc.textBetween(
        Math.max(0, from - 1),
        from,
        '\n'
      )

      // Detect [[ trigger
      if (event.key === '[' && textBefore === '[') {
        event.preventDefault()
        // Delete the first [
        editor.commands.deleteRange({ from: from - 1, to: from })
        setShowPagePicker(true)
      }

      // Detect (( trigger
      if (event.key === '(' && textBefore === '(') {
        event.preventDefault()
        // Delete the first (
        editor.commands.deleteRange({ from: from - 1, to: from })
        setShowBlockPicker(true)
      }
    }

    editor.view.dom.addEventListener('keydown', handleKeyDown)
    return () => editor.view.dom.removeEventListener('keydown', handleKeyDown)
  }, [editor])

  // Notify parent on content change
  React.useEffect(() => {
    if (!editor) return
    const handleUpdate = () => {
      onChange?.(editor.getJSON())
    }
    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor, onChange])

  const handlePageSelect = useCallback(
    (page: { id: number; title: string }) => {
      editor?.commands.setPageLink({ pageId: page.id, title: page.title })
      setShowPagePicker(false)
    },
    [editor]
  )

  const handleBlockSelect = useCallback(
    (block: { id: string }) => {
      editor?.commands.setBlockLink({ blockId: block.id })
      setShowBlockPicker(false)
    },
    [editor]
  )

  if (!editor) return null

  return (
    <div className="wiki-editor">
      <EditorContent editor={editor} />

      <PageLinkPicker
        visible={showPagePicker}
        spaceId={spaceId}
        onSelect={handlePageSelect}
        onCancel={() => setShowPagePicker(false)}
      />

      <BlockLinkPicker
        visible={showBlockPicker}
        spaceId={spaceId}
        onSelect={handleBlockSelect}
        onCancel={() => setShowBlockPicker(false)}
      />
    </div>
  )
}
```

### 5.5 Page View with Backlinks

```tsx
// pages/PageView.tsx
import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Spin } from 'antd'
import { WikiEditor } from '@/components/WikiEditor'
import { BacklinksPanel } from '@/components/BacklinksPanel'
import { getPageContent } from '@/services/pageService'

export const PageView: React.FC = () => {
  const { pageId } = useParams<{ pageId: string }>()
  const [content, setContent] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (pageId) {
      setLoading(true)
      getPageContent(Number(pageId))
        .then((page) => {
          setContent(JSON.parse(page.content || '{}'))
        })
        .finally(() => setLoading(false))
    }
  }, [pageId])

  if (loading) return <Spin />

  return (
    <div className="page-view">
      {/* Page content (read-only or editable) */}
      <WikiEditor
        spaceId={0} // get from context
        initialContent={content}
        onChange={() => {}}
      />

      {/* Backlinks panel at bottom */}
      <BacklinksPanel pageId={Number(pageId)} />
    </div>
  )
}
```

---

## 6. Complete Integration Flow

### 6.1 Creating a Link

```
User types [[  ──▶  Frontend opens PageLinkPicker
                          │
                          ▼
               User searches & selects "My Page"
                          │
                          ▼
               editor.commands.setPageLink({ pageId: 123, title: "My Page" })
                          │
                          ▼
               Text "[[My Page]]" inserted with PageLink mark
                          │
                          ▼
               User saves page  ──▶  POST /space/page
                          │
                          ▼
               Backend parses [[My Page]] on publish
                          │
                          ▼
               WikiLink record created:
               - sourceType: PAGE
               - sourceId: "456" (current page)
               - targetType: PAGE
               - targetPageId: 123
```

### 6.2 Viewing Backlinks

```
User opens Page A  ──▶  GET /space/page/123/content
                              │
                              ▼
                        Render page content
                              │
                              ▼
                        GET /space/page/123/backlinks
                              │
                              ▼
                        Response: [
                          { sourcePageId: 456, sourcePageTitle: "Page B", snippet: "...see [[Page A]]..." },
                          { sourcePageId: 789, sourcePageTitle: "Page C", snippet: "...refer to [[Page A]]..." }
                        ]
                              │
                              ▼
                        Render BacklinksPanel with 2 items
```

---

## Appendix: CSS Styles

```css
/* styles/wiki-links.css */

/* Page link styling */
.wiki-page-link {
  color: #1890ff;
  cursor: pointer;
  text-decoration: none;
  border-bottom: 1px dashed #1890ff;
  transition: all 0.2s;
}

.wiki-page-link:hover {
  background-color: #e6f7ff;
  border-bottom-style: solid;
}

/* Block link styling */
.wiki-block-link {
  color: #722ed1;
  cursor: pointer;
  background: #f9f0ff;
  padding: 0 4px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9em;
}

.wiki-block-link:hover {
  background: #efdbff;
}

/* Backlinks panel */
.backlinks-panel {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.backlinks-panel .ant-list-item {
  padding: 8px 12px;
  border-radius: 4px;
  transition: background 0.2s;
}

.backlinks-panel .ant-list-item:hover {
  background: #fafafa;
}
```

---

## Checklist

### Before Development

- [ ] Understand the `[[Title]]` and `((blockId))` syntax requirements
- [ ] Confirm API base URL (`/knowledge-wiki`)
- [ ] Set up API service layer

### Editor Integration

- [ ] Create `PageLink` Tiptap extension
- [ ] Create `BlockLink` Tiptap extension
- [ ] Implement `[[` trigger for page picker
- [ ] Implement `((` trigger for block picker
- [ ] Build `PageLinkPicker` modal component
- [ ] Build `BlockLinkPicker` modal component

### Backlinks Display

- [ ] Implement `BacklinksPanel` component
- [ ] Call page backlinks API on page load
- [ ] Handle empty state gracefully
- [ ] Add click navigation to source pages

### Testing

- [ ] Verify `[[Title]]` appears in saved content JSON
- [ ] Verify backlinks appear after publishing
- [ ] Test cross-page linking within same space
- [ ] Test block linking with valid block IDs
