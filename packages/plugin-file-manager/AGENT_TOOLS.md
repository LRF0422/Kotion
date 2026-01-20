# File Manager Tools for AI Agent Interaction

This document describes the available tools for AI agents to interact with the file management system.

## Available Tools

### 1. insertImageFromFiles
- **Name**: `insertImageFromFiles`
- **Description**: 从文件管理器中插入图片到文档。需要提供图片文件的路径或ID。
- **Parameters**:
  - `filePath` (required): 图片文件的路径或ID
  - `alt` (optional): 图片的替代文本（无障碍描述）
  - `title` (optional): 图片标题
  - `pos` (optional): 插入位置，不填则在当前光标位置插入

### 2. insertNetworkImage
- **Name**: `insertNetworkImage`
- **Description**: 从网络URL插入图片到文档。需要提供有效的图片URL地址。
- **Parameters**:
  - `url` (required): 网络图片的URL地址
  - `alt` (optional): 图片的替代文本（无障碍描述）
  - `title` (optional): 图片标题
  - `pos` (optional): 插入位置，不填则在当前光标位置插入

### 3. getFileDownloadUrl
- **Name**: `getFileDownloadUrl`
- **Description**: 获取文件的下载链接。仅适用于文件，不适用于文件夹。
- **Parameters**:
  - `fileId` (required): 文件ID

## Usage Examples

### Example 1: List files in a specific folder
```json
{
  "tool_name": "listFiles",
  "arguments": {
    "folderId": "folder-123"
  }
}
```

### Example 2: Search for files containing "report" in name
```json
{
  "tool_name": "searchFiles",
  "arguments": {
    "keyword": "report",
    "fileType": "FILE"
  }
}
```

### Example 3: Create a new folder
```json
{
  "tool_name": "createFolder",
  "arguments": {
    "name": "Project Documents",
    "parentId": "root-456"
  }
}
```

### Example 4: Insert a folder view in the document
```json
{
  "tool_name": "insertFolderView",
  "arguments": {
    "folderId": "documents-789"
  }
}
```

### Example 1: Insert an image from file manager in the document
```json
{
  "tool_name": "insertImageFromFiles",
  "arguments": {
    "filePath": "/path/to/image.jpg",
    "alt": "Example image",
    "pos": 50
  }
}
```

### Example 2: Insert a network image in the document
```json
{
  "tool_name": "insertNetworkImage",
  "arguments": {
    "url": "https://example.com/image.jpg",
    "alt": "Example image",
    "pos": 50
  }
}
```

### Example 3: Get download URL for a file
```json
{
  "tool_name": "getFileDownloadUrl",
  "arguments": {
    "fileId": "file-123"
  }
}
```

## Return Values

All tools return a standardized response object with the following structure:
```typescript
{
  success: boolean,
  message?: string,
  error?: string,
  // Additional data specific to each tool
}
```

## Integration Notes

These tools are automatically registered when the File Manager plugin is loaded and are made available to the AI agent through the plugin system. The tools follow the same interface as other editor tools and integrate seamlessly with the existing agent infrastructure.