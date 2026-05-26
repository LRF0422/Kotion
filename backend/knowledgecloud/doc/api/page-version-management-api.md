# Page Version Management API Documentation

## Overview

This document provides comprehensive API documentation for the page version management feature, including version history tracking, rollback functionality, version comparison, and more.

## Table of Contents

1. [Version Management Features](#version-management-features)
2. [API Endpoints](#api-endpoints)
3. [Data Models](#data-models)
4. [Usage Examples](#usage-examples)
5. [Frontend Integration Guide](#frontend-integration-guide)
6. [Error Handling](#error-handling)

---

## Version Management Features

### Core Features

1. **Version History Tracking**
   - Automatic version creation on every publish
   - Track all changes with timestamps and authors
   - Support for change summaries/commit messages

2. **Version Rollback**
   - Rollback to any previous published version
   - Create new version from historical content
   - Maintain complete audit trail

3. **Version Comparison**
   - Compare content between any two versions
   - Visual diff display support
   - Track additions, deletions, and modifications

4. **Draft Management**
   - Create and edit draft versions
   - Delete draft without affecting published content
   - Prevent rollback to draft versions

5. **Version Analytics**
   - Count total versions per page
   - Filter versions by status, author, or date
   - Paginated version history

---

## API Endpoints

### Base URL
```
/knowledge-wiki/space/page
```

### 1. Get Page Version History (Paginated)

Get paginated list of page versions with filtering options.

**Endpoint:** `GET /page/{pageId}/versions`

**Path Parameters:**
- `pageId` (Long, required): The ID of the page

**Query Parameters:**
- `page` (Integer, optional): Page number (default: 1)
- `size` (Integer, optional): Page size (default: 10)
- `status` (String, optional): Filter by status (ACTIVE, DRAFT, IN_ACTIVE)
- `createUser` (Long, optional): Filter by author user ID

**Response:**
```json
{
  "code": 200,
  "success": true,
  "data": {
    "records": [
      {
        "id": 1001,
        "subjectId": 100,
        "version": "5",
        "status": "ACTIVE",
        "lastVersionId": 1000,
        "title": "My Page Title",
        "content": "Page content...",
        "md5Code": "abc123...",
        "changeSummary": "Updated introduction section",
        "createUser": 10,
        "createTime": "2026-02-19T10:30:00",
        "updateTime": "2026-02-19T10:30:00"
      }
    ],
    "total": 25,
    "size": 10,
    "current": 1,
    "pages": 3
  },
  "msg": "操作成功"
}
```

---

### 2. Get All Page Versions (Non-paginated)

Get complete list of all versions for a page.

**Endpoint:** `GET /page/{pageId}/versions/all`

**Path Parameters:**
- `pageId` (Long, required): The ID of the page

**Response:**
```json
{
  "code": 200,
  "success": true,
  "data": [
    {
      "id": 1005,
      "version": "5",
      "status": "ACTIVE",
      "changeSummary": "Latest version",
      "createUser": 10,
      "createTime": "2026-02-19T10:30:00"
    },
    {
      "id": 1004,
      "version": "4",
      "status": "IN_ACTIVE",
      "changeSummary": "Previous version",
      "createUser": 10,
      "createTime": "2026-02-18T15:20:00"
    }
  ],
  "msg": "操作成功"
}
```

---

### 3. Get Specific Version Content

Retrieve complete content of a specific version.

**Endpoint:** `GET /page/version/{versionId}`

**Path Parameters:**
- `versionId` (Long, required): The ID of the version

**Response:**
```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": 1005,
    "subjectId": 100,
    "version": "5",
    "status": "ACTIVE",
    "lastVersionId": 1004,
    "title": "My Page Title",
    "content": "Full page content with all blocks and formatting...",
    "md5Code": "abc123...",
    "changeSummary": "Updated introduction section",
    "createUser": 10,
    "createTime": "2026-02-19T10:30:00",
    "updateTime": "2026-02-19T10:30:00"
  },
  "msg": "操作成功"
}
```

---

### 4. Rollback to Specific Version

Rollback page content to a previous version. This creates a new version with the content from the target version.

**Endpoint:** `POST /page/{pageId}/rollback`

**Path Parameters:**
- `pageId` (Long, required): The ID of the page

**Request Body:**
```json
{
  "targetVersionId": 1003,
  "changeSummary": "Rollback to version before breaking changes"
}
```

**Request Body Parameters:**
- `targetVersionId` (Long, required): The version ID to rollback to
- `changeSummary` (String, optional): Custom summary for the rollback action

**Response:**
```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": 1006,
    "subjectId": 100,
    "version": "6",
    "status": "ACTIVE",
    "lastVersionId": 1005,
    "content": "Restored content from version 3...",
    "changeSummary": "Rollback to version before breaking changes",
    "createUser": 10,
    "createTime": "2026-02-19T11:00:00"
  },
  "msg": "操作成功"
}
```

**Error Responses:**
- `3003`: Page version not found
- `3006`: No version to rollback (no previous versions exist)
- `3007`: Cannot rollback to draft version
- `3008`: Target version is already the current active version

---

### 5. Compare Two Versions

Compare content between two versions to see differences.

**Endpoint:** `POST /page/versions/compare`

**Request Body:**
```json
{
  "sourceVersionId": 1003,
  "targetVersionId": 1005
}
```

**Request Body Parameters:**
- `sourceVersionId` (Long, required): The source version ID (usually older)
- `targetVersionId` (Long, required): The target version ID (usually newer)

**Response:**
```json
{
  "code": 200,
  "success": true,
  "data": "Source length: 1245 chars\nTarget length: 1389 chars\nDifference: 144 chars\n",
  "msg": "操作成功"
}
```

**Note:** The comparison result is currently a simple text summary. For advanced diff visualization, integrate a frontend diff library like `diff-match-patch` or `react-diff-viewer`.

**Error Responses:**
- `3003`: One or both versions not found
- `3009`: Invalid version comparison (versions belong to different pages)

---

### 6. Delete Draft Version

Delete the draft version of a page without affecting published versions.

**Endpoint:** `DELETE /page/{pageId}/draft`

**Path Parameters:**
- `pageId` (Long, required): The ID of the page

**Response:**
```json
{
  "code": 200,
  "success": true,
  "data": null,
  "msg": "操作成功"
}
```

---

### 7. Get Version Count

Get the total number of versions for a page.

**Endpoint:** `GET /page/{pageId}/versions/count`

**Path Parameters:**
- `pageId` (Long, required): The ID of the page

**Response:**
```json
{
  "code": 200,
  "success": true,
  "data": 25,
  "msg": "操作成功"
}
```

---

## Data Models

### PageVersion Entity

```typescript
interface PageVersion {
  id: number;              // Version ID
  subjectId: number;       // Page ID
  version: string;         // Version number (e.g., "5")
  status: VersionStatus;   // ACTIVE, DRAFT, or IN_ACTIVE
  lastVersionId?: number;  // Previous version ID
  activeVersionId?: number;// Current active version ID
  parentId?: number;       // Parent page ID
  content: string;         // Page content (JSON string or HTML)
  md5Code: string;         // Content MD5 hash for change detection
  title: string;           // Page title
  description?: string;    // Page description
  changeSummary?: string;  // Change description/commit message
  createUser: number;      // Creator user ID
  createTime: string;      // Creation timestamp
  updateTime: string;      // Update timestamp
  tenantId?: string;       // Tenant ID
  isDeleted: number;       // Soft delete flag
}
```

### VersionStatus Enum

```typescript
enum VersionStatus {
  DRAFT = 'DRAFT',         // Unpublished draft
  ACTIVE = 'ACTIVE',       // Currently active/published
  IN_ACTIVE = 'IN_ACTIVE'  // Previous/historical version
}
```

### Request DTOs

#### RollbackVersionDTO
```typescript
interface RollbackVersionDTO {
  pageId: number;          // Required: Page ID
  targetVersionId: number; // Required: Target version to rollback to
  changeSummary?: string;  // Optional: Custom rollback message
}
```

#### CompareVersionDTO
```typescript
interface CompareVersionDTO {
  sourceVersionId: number; // Required: Source version ID
  targetVersionId: number; // Required: Target version ID
}
```

#### QueryPageVersionDTO
```typescript
interface QueryPageVersionDTO {
  pageId?: number;         // Filter by page ID
  status?: string;         // Filter by status
  createUser?: number;     // Filter by author
  page?: number;           // Page number (default: 1)
  size?: number;           // Page size (default: 10)
}
```

---

## Usage Examples

### Example 1: Display Version History Timeline

```typescript
// Fetch version history
const fetchVersionHistory = async (pageId: number, page: number = 1) => {
  const response = await fetch(
    `/knowledge-wiki/space/page/${pageId}/versions?page=${page}&size=10`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const result = await response.json();
  return result.data;
};

// Usage in React component
const VersionHistory: React.FC<{ pageId: number }> = ({ pageId }) => {
  const [versions, setVersions] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, total: 0 });
  
  useEffect(() => {
    fetchVersionHistory(pageId, pagination.current).then(data => {
      setVersions(data.records);
      setPagination({
        current: data.current,
        total: data.total
      });
    });
  }, [pageId, pagination.current]);
  
  return (
    <div className="version-timeline">
      {versions.map(version => (
        <div key={version.id} className="version-item">
          <div className="version-header">
            <span className="version-number">v{version.version}</span>
            <span className="version-status">{version.status}</span>
          </div>
          <div className="version-meta">
            <span>{new Date(version.createTime).toLocaleString()}</span>
            <span>by User {version.createUser}</span>
          </div>
          {version.changeSummary && (
            <div className="version-summary">{version.changeSummary}</div>
          )}
        </div>
      ))}
    </div>
  );
};
```

---

### Example 2: Rollback to Previous Version

```typescript
const rollbackToVersion = async (
  pageId: number,
  targetVersionId: number,
  changeSummary?: string
) => {
  try {
    const response = await fetch(
      `/knowledge-wiki/space/page/${pageId}/rollback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetVersionId,
          changeSummary: changeSummary || `Rollback to version ${targetVersionId}`
        })
      }
    );
    
    const result = await response.json();
    
    if (result.success) {
      console.log('Rollback successful:', result.data);
      // Refresh page content
      return result.data;
    } else {
      throw new Error(result.msg);
    }
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
};

// Usage with confirmation dialog
const handleRollback = async (versionId: number) => {
  const confirmed = await showConfirmDialog({
    title: 'Rollback Version',
    message: 'Are you sure you want to rollback to this version? This will create a new version with the old content.',
    confirmText: 'Rollback',
    cancelText: 'Cancel'
  });
  
  if (confirmed) {
    const summary = await promptForSummary();
    await rollbackToVersion(pageId, versionId, summary);
    // Reload page or show success message
    showSuccessMessage('Page rolled back successfully!');
  }
};
```

---

### Example 3: Compare Two Versions

```typescript
const compareVersions = async (
  sourceVersionId: number,
  targetVersionId: number
) => {
  const response = await fetch(
    `/knowledge-wiki/space/page/versions/compare`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        sourceVersionId,
        targetVersionId
      })
    }
  );
  
  const result = await response.json();
  return result.data;
};

// Usage in version comparison view
const VersionCompare: React.FC = () => {
  const [sourceVersion, setSourceVersion] = useState<PageVersion | null>(null);
  const [targetVersion, setTargetVersion] = useState<PageVersion | null>(null);
  const [diffResult, setDiffResult] = useState<string>('');
  
  const handleCompare = async () => {
    if (sourceVersion && targetVersion) {
      const diff = await compareVersions(sourceVersion.id, targetVersion.id);
      setDiffResult(diff);
    }
  };
  
  return (
    <div className="version-compare">
      <div className="version-selector">
        <VersionSelect 
          label="Compare from" 
          value={sourceVersion}
          onChange={setSourceVersion}
        />
        <VersionSelect 
          label="Compare to" 
          value={targetVersion}
          onChange={setTargetVersion}
        />
        <button onClick={handleCompare}>Compare</button>
      </div>
      {diffResult && (
        <div className="diff-result">
          <pre>{diffResult}</pre>
        </div>
      )}
    </div>
  );
};
```

---

### Example 4: Enhanced Diff Visualization

For better diff visualization, use a library like `react-diff-viewer`:

```typescript
import ReactDiffViewer from 'react-diff-viewer';

const EnhancedVersionCompare: React.FC = () => {
  const [sourceContent, setSourceContent] = useState('');
  const [targetContent, setTargetContent] = useState('');
  
  const loadVersionContent = async (versionId: number) => {
    const response = await fetch(
      `/knowledge-wiki/space/page/version/${versionId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    const result = await response.json();
    return result.data.content;
  };
  
  useEffect(() => {
    if (sourceVersionId && targetVersionId) {
      Promise.all([
        loadVersionContent(sourceVersionId),
        loadVersionContent(targetVersionId)
      ]).then(([source, target]) => {
        setSourceContent(source);
        setTargetContent(target);
      });
    }
  }, [sourceVersionId, targetVersionId]);
  
  return (
    <ReactDiffViewer
      oldValue={sourceContent}
      newValue={targetContent}
      splitView={true}
      showDiffOnly={false}
      leftTitle={`Version ${sourceVersion}`}
      rightTitle={`Version ${targetVersion}`}
    />
  );
};
```

---

## Frontend Integration Guide

### Recommended UI Components

1. **Version History Sidebar**
   - Timeline view of all versions
   - Filter by author, date, status
   - Quick actions: view, rollback, compare

2. **Version Comparison Modal**
   - Side-by-side diff view
   - Highlight additions/deletions
   - Option to rollback directly from comparison

3. **Rollback Confirmation Dialog**
   - Show target version details
   - Input for custom change summary
   - Warning about creating new version

4. **Version Badge**
   - Display current version number
   - Show draft indicator
   - Link to version history

### State Management

```typescript
// Version context for React applications
interface VersionContextType {
  currentVersion: PageVersion | null;
  versions: PageVersion[];
  loading: boolean;
  fetchVersions: (pageId: number) => Promise<void>;
  rollback: (versionId: number, summary?: string) => Promise<void>;
  compare: (v1: number, v2: number) => Promise<string>;
  deleteDraft: (pageId: number) => Promise<void>;
}

const VersionContext = createContext<VersionContextType | undefined>(undefined);

export const VersionProvider: React.FC<{ pageId: number }> = ({ 
  pageId, 
  children 
}) => {
  const [currentVersion, setCurrentVersion] = useState<PageVersion | null>(null);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [loading, setLoading] = useState(false);
  
  const fetchVersions = async (pageId: number) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/knowledge-wiki/space/page/${pageId}/versions/all`
      );
      const result = await response.json();
      setVersions(result.data);
      
      // Find active version
      const active = result.data.find(v => v.status === 'ACTIVE');
      setCurrentVersion(active);
    } finally {
      setLoading(false);
    }
  };
  
  // Implement other methods...
  
  return (
    <VersionContext.Provider value={{
      currentVersion,
      versions,
      loading,
      fetchVersions,
      rollback,
      compare,
      deleteDraft
    }}>
      {children}
    </VersionContext.Provider>
  );
};
```

---

## Error Handling

### Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 3001 | 页面不存在 | Page not found |
| 3003 | 页面版本不存在 | Page version not found |
| 3006 | 没有可回滚的版本 | No version available to rollback |
| 3007 | 不能回滚到草稿版本 | Cannot rollback to draft version |
| 3008 | 该版本已经是当前激活版本 | Version is already the active version |
| 3009 | 无效的版本对比 | Invalid version comparison (different pages) |
| 6001 | 参数无效 | Invalid parameters |

### Error Handling Example

```typescript
const handleVersionOperation = async (operation: () => Promise<any>) => {
  try {
    const result = await operation();
    return result;
  } catch (error: any) {
    const errorCode = error.response?.data?.code;
    
    switch (errorCode) {
      case 3003:
        showError('Version not found. It may have been deleted.');
        break;
      case 3006:
        showError('This page has no previous versions to rollback to.');
        break;
      case 3007:
        showError('Cannot rollback to a draft version. Please select a published version.');
        break;
      case 3008:
        showError('This version is already active.');
        break;
      case 3009:
        showError('Cannot compare versions from different pages.');
        break;
      default:
        showError('An unexpected error occurred. Please try again.');
    }
    
    throw error;
  }
};
```

---

## Best Practices

1. **Always provide change summaries** when rolling back versions for better audit trail
2. **Implement confirmation dialogs** for destructive operations like rollback
3. **Cache version list** locally to reduce API calls
4. **Show loading states** during version operations
5. **Implement optimistic UI updates** where appropriate
6. **Add keyboard shortcuts** for power users (e.g., Cmd+H for version history)
7. **Display version count badge** to indicate available history
8. **Auto-refresh version list** after rollback operations
9. **Implement version comparison** with visual diff for better UX
10. **Add version restore preview** before confirming rollback

---

## Additional Features Ideas

### Future Enhancements

1. **Named Versions/Tags**
   - Allow users to tag important versions (e.g., "v1.0 Release")
   - Quick access to tagged versions

2. **Version Branching**
   - Create experimental branches from any version
   - Merge branches back into main timeline

3. **Collaborative Version Review**
   - Comment on specific versions
   - Approve/reject version changes

4. **Version Analytics**
   - Most edited pages
   - Active contributors by version count
   - Version creation frequency charts

5. **Auto-save Versions**
   - Periodic auto-save while editing
   - Configurable auto-save interval

6. **Version Export**
   - Export specific version as PDF/HTML
   - Bulk export version history

7. **Version Diff Notifications**
   - Notify users when someone creates a new version
   - Email digest of version changes

8. **Advanced Search**
   - Search content across all versions
   - Find when specific content was added/removed

---

## Support

For questions or issues regarding the version management API:
- Technical Documentation: This document
- API Testing: Use the Swagger UI at `/doc.html`
- Backend Issues: Contact the backend team
- Frontend Integration: Refer to the examples above

---

**Last Updated:** February 19, 2026  
**API Version:** 1.0  
**Maintainer:** Knowledge Cloud Platform Team

