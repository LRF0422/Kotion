# File Center Frontend Integration Guide

## Overview

The File Center service provides comprehensive file management capabilities including file upload, download, organization, and search. This document provides integration guidelines for frontend applications.

**Service Base URL:** `http://192.168.3.43:7004` (via Gateway: `http://192.168.3.43:1889/file-center`)

## Table of Contents

1. [Authentication](#authentication)
2. [API Endpoints](#api-endpoints)
3. [Data Models](#data-models)
4. [Integration Examples](#integration-examples)
5. [Error Handling](#error-handling)
6. [Best Practices](#best-practices)

---

## Authentication

All API requests must include authentication tokens in the request headers:

```javascript
headers: {
  'Authorization': 'Bearer <access_token>',
  'Blade-Auth': 'bearer <token>',
  'Content-Type': 'application/json'
}
```

For file upload endpoints, use `multipart/form-data`:

```javascript
headers: {
  'Authorization': 'Bearer <access_token>',
  'Blade-Auth': 'bearer <token>',
  'Content-Type': 'multipart/form-data'
}
```

---

## API Endpoints

### 1. File Upload

#### 1.1 Upload Single File

**Endpoint:** `POST /file/upload`

**Content-Type:** `multipart/form-data`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file | File | Yes | File to upload |
| parentId | Long | No | Parent folder ID (null for root) |
| repositoryKey | String | No | Repository key (uses default if not provided) |

**Request Example:**

```javascript
const formData = new FormData();
formData.append('file', fileObject);
formData.append('parentId', 123);
formData.append('repositoryKey', 'my-repo');

const response = await fetch('http://192.168.3.43:1889/file-center/file/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Blade-Auth': `bearer ${token}`
  },
  body: formData
});

const result = await response.json();
```

**Response:**

```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": 1001,
    "type": "FILE",
    "name": "document.pdf",
    "parentId": 123,
    "path": "upload/20260208/abc123.pdf",
    "suffix": "pdf",
    "size": 1024000,
    "fileKey": "file-record-uuid",
    "repositoryKey": "my-repo",
    "createTime": "2026-02-08T10:30:00",
    "updateTime": "2026-02-08T10:30:00"
  },
  "msg": "Operation successful"
}
```

#### 1.2 Batch Upload Files

**Endpoint:** `POST /file/batch-upload`

**Content-Type:** `multipart/form-data`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| files | File[] | Yes | Array of files to upload |
| parentId | Long | No | Parent folder ID |
| repositoryKey | String | No | Repository key |

**Request Example:**

```javascript
const formData = new FormData();
files.forEach(file => {
  formData.append('files', file);
});
formData.append('parentId', 123);

const response = await fetch('http://192.168.3.43:1889/file-center/file/batch-upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Blade-Auth': `bearer ${token}`
  },
  body: formData
});
```

**Response:**

```json
{
  "code": 200,
  "success": true,
  "data": [
    {
      "id": 1001,
      "name": "file1.pdf",
      "type": "FILE",
      ...
    },
    {
      "id": 1002,
      "name": "file2.docx",
      "type": "FILE",
      ...
    }
  ]
}
```

### 2. File Download

**Endpoint:** `GET /file/{fileId}/download`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| fileId | Long | Yes | File ID to download |

**Request Example:**

The backend resolves the stored OSS object key from `path`; clients should use
the authenticated file-center endpoint instead of persisting or opening the OSS
URL directly.

```javascript
const response = await fetch(`http://192.168.3.43:1889/file-center/file/${fileId}/download`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Blade-Auth': `bearer ${token}`
  }
});

const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = filename;
a.click();
```

### 3. File/Folder Management

#### 3.1 Create Folder

**Endpoint:** `POST /file`

**Request Body:**

```json
{
  "type": "FOLDER",
  "name": "My Documents",
  "parentId": 100,
  "repositoryKey": "my-repo"
}
```

**Response:**

```json
{
  "code": 200,
  "success": true,
  "data": null,
  "msg": "Operation successful"
}
```

#### 3.2 Get File/Folder by ID

**Endpoint:** `GET /file/{fileId}`

**Request Example:**

```javascript
const response = await fetch(`http://192.168.3.43:1889/file-center/file/${fileId}`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

**Response:**

```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": 1001,
    "type": "FILE",
    "name": "document.pdf",
    "parentId": 123,
    "path": "https://oss.example.com/files/abc123.pdf",
    "suffix": "pdf",
    "size": 1024000,
    "ancestors": "0,100,123"
  }
}
```

#### 3.3 Update File Metadata

**Endpoint:** `PUT /file/{fileId}`

**Request Body:**

```json
{
  "name": "Updated Document.pdf",
  "parentId": 456
}
```

#### 3.4 Rename File/Folder

**Endpoint:** `PUT /file/{fileId}/rename`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| newName | String | Yes | New name for the file/folder |

**Request Example:**

```javascript
const response = await fetch(`http://192.168.3.43:1889/file-center/file/${fileId}/rename?newName=${encodeURIComponent(newName)}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

#### 3.5 Move File/Folder

**Endpoint:** `PUT /file/move`

**Request Body:**

```json
{
  "sourceId": 1001,
  "targetId": 456
}
```

**Description:** Moves a file or folder from one location to another. The target must be a folder.

#### 3.6 Delete File/Folder

**Endpoint:** `DELETE /file/{fileId}`

**Request Example:**

```javascript
const response = await fetch(`http://192.168.3.43:1889/file-center/file/${fileId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

**Note:** Deleting a folder will recursively delete all its contents.

#### 3.7 Batch Delete Files

**Endpoint:** `DELETE /file/batch`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| fileIds | Long[] | Yes | Array of file IDs to delete |

**Request Example:**

```javascript
const fileIds = [1001, 1002, 1003];
const response = await fetch(`http://192.168.3.43:1889/file-center/file/batch?fileIds=${fileIds.join(',')}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### 4. Folder Navigation

#### 4.1 Get Root Folder Tree

**Endpoint:** `GET /folder/root`

**Description:** Returns the complete folder tree structure from the root.

**Response:**

```json
{
  "code": 200,
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Documents",
      "parentId": 0,
      "children": [
        {
          "id": 2,
          "name": "Work",
          "parentId": 1,
          "children": []
        }
      ]
    }
  ]
}
```

#### 4.2 Get Repository Folder Tree

**Endpoint:** `GET /repo/{repoKey}/folder/tree`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| repoKey | String | Yes | Repository key |

#### 4.3 Get Folder Children

**Endpoint:** `GET /folder/children`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| folderId | Long | Yes | Folder ID |
| mediaType | String | No | Filter by media type (IMAGE, PDF, DOCX, etc.) |
| fileName | String | No | Filter by file name (fuzzy search) |

**Request Example:**

```javascript
const params = new URLSearchParams({
  folderId: 123,
  mediaType: 'IMAGE',
  fileName: 'photo'
});

const response = await fetch(`http://192.168.3.43:1889/file-center/folder/children?${params}`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

**Response:**

```json
{
  "code": 200,
  "success": true,
  "data": [
    {
      "id": 1001,
      "type": "FILE",
      "name": "photo.jpg",
      "parentId": 123,
      "size": 204800,
      "suffix": "jpg"
    }
  ]
}
```

### 5. File Search

**Endpoint:** `GET /file/search`

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| keyword | String | Yes | Search keyword |
| repositoryKey | String | No | Limit search to specific repository |

**Request Example:**

```javascript
const params = new URLSearchParams({
  keyword: 'report',
  repositoryKey: 'my-repo'
});

const response = await fetch(`http://192.168.3.43:1889/file-center/file/search?${params}`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## Data Models

### FileType Enum

```typescript
enum FileType {
  FILE = "FILE",
  FOLDER = "FOLDER"
}
```

### MediaType Enum

```typescript
enum MediaType {
  IMAGE = "IMAGE",
  DOCX = "DOCX",
  DOC = "DOC",
  XLS = "XLS",
  XLSX = "XLSX",
  PDF = "PDF",
  OTHER = "OTHER"
}
```

### KnowledgeFileVO

```typescript
interface KnowledgeFileVO {
  id: number;
  type: FileType;
  name: string;
  parentId: number;
  path: string;              // Non-HTTP OSS object key (for example upload/.../file.pdf)
  suffix: string;            // File extension
  size: number;              // File size in bytes
  fileKey: string;           // File-center application UUID
  repositoryKey: string;     // Repository identifier
  ancestors: string;         // Ancestor path (e.g., "0,100,123")
  createTime: string;        // ISO 8601 format
  updateTime: string;        // ISO 8601 format
}
```

### Standard Response

```typescript
interface ApiResponse<T> {
  code: number;              // 200 for success
  success: boolean;
  data: T;
  msg: string;
}
```

---

## Integration Examples

### Example 1: File Upload Component (React)

```jsx
import React, { useState } from 'react';
import axios from 'axios';

const FileUpload = ({ parentId, onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    if (parentId) {
      formData.append('parentId', parentId);
    }

    setUploading(true);
    try {
      const response = await axios.post(
        'http://192.168.3.43:1889/file-center/file/upload',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (response.data.success) {
        onUploadSuccess(response.data.data);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={handleFileChange}
        disabled={uploading}
      />
      {uploading && <span>Uploading...</span>}
    </div>
  );
};
```

### Example 2: File Browser Component (Vue.js)

```vue
<template>
  <div class="file-browser">
    <div class="breadcrumb">
      <span v-for="(item, index) in breadcrumb" :key="index" @click="navigateTo(item.id)">
        {{ item.name }} /
      </span>
    </div>

    <div class="file-list">
      <div
        v-for="file in files"
        :key="file.id"
        class="file-item"
        @click="handleFileClick(file)"
      >
        <i :class="getFileIcon(file)"></i>
        <span>{{ file.name }}</span>
        <span class="file-size">{{ formatFileSize(file.size) }}</span>
        <button @click.stop="deleteFile(file.id)">Delete</button>
        <button @click.stop="downloadFile(file.id)">Download</button>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  data() {
    return {
      files: [],
      currentFolderId: null,
      breadcrumb: []
    };
  },
  
  methods: {
    async loadFiles(folderId) {
      try {
        const response = await axios.get(
          `http://192.168.3.43:1889/file-center/folder/children`,
          {
            params: { folderId: folderId || 0 },
            headers: {
              'Authorization': `Bearer ${this.token}`
            }
          }
        );
        
        if (response.data.success) {
          this.files = response.data.data;
          this.currentFolderId = folderId;
        }
      } catch (error) {
        console.error('Failed to load files:', error);
      }
    },

    handleFileClick(file) {
      if (file.type === 'FOLDER') {
        this.loadFiles(file.id);
        this.breadcrumb.push({ id: file.id, name: file.name });
      }
    },

    async deleteFile(fileId) {
      if (!confirm('Are you sure you want to delete this file?')) return;

      try {
        const response = await axios.delete(
          `http://192.168.3.43:1889/file-center/file/${fileId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.token}`
            }
          }
        );

        if (response.data.success) {
          this.loadFiles(this.currentFolderId);
        }
      } catch (error) {
        console.error('Delete failed:', error);
      }
    },

    downloadFile(fileId) {
      window.open(
        `http://192.168.3.43:1889/file-center/file/${fileId}/download`,
        '_blank'
      );
    },

    formatFileSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    getFileIcon(file) {
      if (file.type === 'FOLDER') return 'icon-folder';
      return `icon-${file.suffix || 'file'}`;
    }
  },

  mounted() {
    this.loadFiles(null);
  }
};
</script>
```

### Example 3: Drag & Drop Upload

```javascript
const FileDropZone = () => {
  const handleDrop = async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    formData.append('parentId', currentFolderId);

    try {
      const response = await fetch(
        'http://192.168.3.43:1889/file-center/file/batch-upload',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Blade-Auth': `bearer ${token}`
          },
          body: formData
        }
      );

      const result = await response.json();
      if (result.success) {
        console.log('Files uploaded:', result.data);
        refreshFileList();
      }
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="drop-zone"
    >
      Drop files here to upload
    </div>
  );
};
```

---

## Error Handling

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| 401 | Unauthorized | Check authentication token |
| 403 | Forbidden | Verify user permissions |
| 404 | File not found | Verify file ID exists |
| 400 | Bad request | Check request parameters |
| 500 | Server error | Contact system administrator |

### Error Response Format

```json
{
  "code": 400,
  "success": false,
  "data": null,
  "msg": "File cannot be empty"
}
```

### Handling Errors in JavaScript

```javascript
try {
  const response = await fetch(url, options);
  const result = await response.json();
  
  if (!result.success) {
    // Handle business logic errors
    console.error('Operation failed:', result.msg);
    showErrorMessage(result.msg);
    return;
  }
  
  // Handle success
  handleSuccess(result.data);
} catch (error) {
  // Handle network or parsing errors
  console.error('Request failed:', error);
  showErrorMessage('Network error, please try again');
}
```

---

## Best Practices

### 1. File Upload Optimization

- **Chunk Upload for Large Files:** For files larger than 10MB, consider implementing chunk upload
- **Progress Tracking:** Use XMLHttpRequest or axios for upload progress tracking
- **File Validation:** Validate file type and size on the client side before upload

```javascript
const validateFile = (file) => {
  const maxSize = 50 * 1024 * 1024; // 50MB
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  
  if (file.size > maxSize) {
    alert('File size exceeds 50MB');
    return false;
  }
  
  if (!allowedTypes.includes(file.type)) {
    alert('File type not supported');
    return false;
  }
  
  return true;
};
```

### 2. Caching Strategy

- Cache folder tree structures locally
- Implement pagination for large file lists
- Use virtual scrolling for rendering large lists

### 3. Performance Tips

- Lazy load folder contents
- Implement debouncing for search queries
- Use thumbnails for image preview instead of full-size images
- Batch operations when possible

### 4. Security Considerations

- Always validate file types on both client and server
- Implement file size limits
- Sanitize file names before upload
- Use HTTPS for all API calls in production

### 5. User Experience

- Show upload progress with progress bar
- Provide clear error messages
- Implement retry mechanism for failed uploads
- Allow drag-and-drop file upload
- Show loading states for all async operations

---

## OSS Configuration

The File Center service uses OSS (Object Storage Service) for file storage. Supported providers:

- **Minio** (Default)
- **Aliyun OSS**
- **Qiniu Cloud**

### Configuration Requirements

The OSS client must be configured in the service's application configuration:

```yaml
oss:
  enabled: true
  name: minio  # or alioss, qiniu
  endpoint: http://192.168.3.43:9000
  accessKey: your-access-key
  secretKey: your-secret-key
  bucketName: knowledgex
```

---

## Support

For issues or questions regarding the File Center API, please contact:

- **Development Team:** [Contact Information]
- **API Documentation:** http://192.168.3.43:1889/doc.html
- **Service Port:** 7004 (Direct) / 1889 (Gateway)

---

## Changelog

### Version 1.1.0 (2026-02-08)

- ✅ Added file upload with OSS integration
- ✅ Added batch file upload
- ✅ Added file download functionality
- ✅ Added file/folder rename
- ✅ Added file/folder move
- ✅ Added file/folder delete (with recursive delete for folders)
- ✅ Added batch delete
- ✅ Added file search
- ✅ Enhanced folder navigation
- ✅ Added comprehensive API documentation
- ✅ Improved error handling

### Version 1.0.0 (Initial Release)

- Basic file and folder management
- Repository management
- Folder tree navigation
