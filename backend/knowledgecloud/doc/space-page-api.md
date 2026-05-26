# Space & Page API 接口文档

> Base URL: `/knowledge-wiki/space`

## 通用说明

### 响应格式
所有接口返回统一格式：
```json
{
  "code": 200,
  "success": true,
  "data": { ... },
  "msg": "操作成功"
}
```

### 分页参数
分页接口使用 `Pageable` 参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| current | Integer | 当前页码，默认1 |
| size | Integer | 每页条数，默认10 |

---

## 一、Space 空间接口

### 1.1 创建空间
```http
POST /space
Content-Type: application/json
```

**请求参数 (SpaceDTO):**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | String | 是 | 空间名称 |
| icon | String | 否 | 空间图标 |
| description | String | 否 | 空间描述 |
| type | String | 否 | 空间类型，默认"SPACE" |

**响应示例:**
```json
{
  "code": 200,
  "success": true,
  "data": null
}
```

---

### 1.2 获取个人空间
```http
GET /space/personal
```

**响应示例:**
```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": 1,
    "name": "个人空间",
    "icon": "user",
    "type": "PERSONAL",
    "userId": 100,
    "createTime": "2024-01-01 10:00:00"
  }
}
```

---

### 1.3 空间列表（分页）
```http
GET /space/list
```

**查询参数 (QuerySpaceDTO):**
| 参数 | 类型 | 说明 |
|------|------|------|
| current | Integer | 当前页码 |
| size | Integer | 每页条数 |
| searchValue | String | 搜索关键词 |
| template | Boolean | 是否模板 |
| favorite | Boolean | 是否收藏 |

---

### 1.4 空间详情
```http
GET /space/{id}/detail
```

**路径参数:**
- `id`: 空间ID

**响应示例:**
```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": 1,
    "name": "工作空间",
    "icon": "folder",
    "description": "团队协作空间",
    "type": "SPACE",
    "favorite": false,
    "pageCount": 10,
    "memberCount": 5
  }
}
```

---

### 1.5 收藏空间
```http
POST /space/{id}/favorite
```

**路径参数:**
- `id`: 空间ID

---

## 二、Page 页面接口

### 2.1 创建页面
```http
POST /space/page
Content-Type: application/json
```

**请求参数 (PageDTO):**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| spaceId | Long | 是 | 所属空间ID |
| title | String | 是 | 页面标题 |
| parentId | Long | 否 | 父页面ID |
| content | String | 否 | 页面内容(JSON) |
| templateId | Long | 否 | 模板ID |
| publish | Boolean | 否 | 是否直接发布 |
| icon | String | 否 | 页面图标 |

**响应示例:**
```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": 100,
    "title": "新页面",
    "spaceId": 1,
    "content": "{\"type\":\"doc\",\"content\":[...]}",
    "status": "ACTIVE",
    "createTime": "2024-01-01 10:00:00"
  }
}
```

---

### 2.2 获取页面内容
```http
GET /space/page/{id}/content
```

**路径参数:**
- `id`: 页面ID

**响应示例:**
```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": 100,
    "title": "页面标题",
    "spaceId": 1,
    "content": "{\"type\":\"doc\",\"content\":[...]}",
    "parentId": null,
    "status": "ACTIVE",
    "draft": false,
    "createTime": "2024-01-01 10:00:00",
    "updateTime": "2024-01-02 15:30:00"
  }
}
```

---

### 2.3 获取页面树
```http
GET /space/{id}/page/tree
```

**路径参数:**
- `id`: 空间ID

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| searchValue | String | 搜索关键词(可选) |

**响应示例:**
```json
{
  "code": 200,
  "success": true,
  "data": [
    {
      "id": 1,
      "parentId": 0,
      "name": "首页",
      "isDraft": false,
      "updateTime": "2024-01-02 15:30:00",
      "createUser": "张三",
      "icon": "file",
      "children": [
        {
          "id": 2,
          "parentId": 1,
          "name": "子页面",
          "isDraft": true
        }
      ]
    }
  ]
}
```

---

### 2.4 页面列表（分页）
```http
GET /space/page/list
```

**查询参数 (QueryPageDTO):**
| 参数 | 类型 | 说明 |
|------|------|------|
| spaceId | Long | 空间ID |
| status | String | 页面状态 |
| searchValue | String | 搜索关键词 |
| current | Integer | 当前页码 |
| size | Integer | 每页条数 |

---

### 2.5 移动页面到回收站
```http
DELETE /space/page/{id}/trash
```

**路径参数:**
- `id`: 页面ID

---

### 2.6 恢复页面
```http
PUT /space/page/{id}/restore
```

**路径参数:**
- `id`: 页面ID

---

### 2.7 页面另存为模板
```http
POST /space/page/{id}/template
```

**路径参数:**
- `id`: 页面ID

---

### 2.8 收藏页面
```http
POST /space/page/{id}/favorite
```

**路径参数:**
- `id`: 页面ID

---

### 2.9 获取收藏页面
```http
GET /space/page/favorites
```

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| scope | String | 收藏范围(SPACE/PERSONAL) |

---

### 2.10 获取最近更新页面
```http
GET /space/page/recent
```

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| searchValue | String | 搜索关键词 |
| current | Integer | 当前页码 |
| size | Integer | 每页条数 |

---

### 2.11 模板列表
```http
GET /space/page/templates
```

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| searchValue | String | 搜索关键词 |

---

## 三、Block 块接口

### 3.1 批量保存页面块
```http
POST /space/page/{pageId}/blocks
Content-Type: application/json
```

**路径参数:**
- `pageId`: 页面ID

**请求参数 (SaveBlocksDTO):**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | String | 是 | 页面内容(JSON) |
| publish | Boolean | 否 | 是否发布 |

**请求体示例:**
```json
{
  "content": "{\"type\":\"doc\",\"content\":[...]}",
  "publish": true
}
```

---

### 3.2 更新单个块
```http
PUT /space/page/block/{blockId}
Content-Type: application/json
```

**路径参数:**
- `blockId`: 块ID

**请求参数 (UpdateBlockDTO):**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageId | Long | 是 | 页面ID |
| blockId | String | 是 | 块ID |
| content | JSONObject | 否 | 块内容属性 |
| text | String | 否 | 块文本 |
| type | String | 否 | 块类型 |
| partialUpdate | Boolean | 否 | 是否立即发布 |

---

### 3.3 获取块信息
```http
GET /space/page/block?id={blockId}
```

**查询参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | String | 是 | 块ID |

---

### 3.4 获取块详细信息（包含上下文）
```http
GET /space/page/block/detail/{blockId}
```

**路径参数:**
- `blockId`: 块ID

**响应示例:**
```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": "block_123",
    "type": "paragraph",
    "pageId": 100,
    "pageTitle": "页面标题",
    "spaceId": 1,
    "text": "这是段落文本",
    "attrs": {},
    "marks": [],
    "parentId": "root",
    "path": "0",
    "fullPath": "0.1.2"
  }
}
```

---

### 3.5 搜索块
```http
GET /space/page/block/search
```

**查询参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | String | 是 | 搜索关键词 |
| pageId | Long | 否 | 限定页面ID |
| spaceId | Long | 否 | 限定空间ID |

---

### 3.6 刷新块索引
```http
GET /space/page/block/refresh
```

---

## 四、Version 版本接口

### 4.1 获取页面版本历史
```http
GET /space/page/{pageId}/versions
```

**路径参数:**
- `pageId`: 页面ID

**查询参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| current | Integer | 当前页码 |
| size | Integer | 每页条数 |
| status | String | 版本状态(DRAFT/ACTIVE/IN_ACTIVE) |
| createUser | Long | 创建人ID |

**响应示例:**
```json
{
  "code": 200,
  "success": true,
  "data": {
    "records": [
      {
        "id": 1000,
        "subjectId": 100,
        "version": "2",
        "status": "ACTIVE",
        "title": "页面标题",
        "changeSummary": "更新内容",
        "md5Code": "abc123",
        "createUser": 1,
        "createTime": "2024-01-02 15:30:00"
      }
    ],
    "total": 10,
    "current": 1,
    "size": 10
  }
}
```

---

### 4.2 获取所有版本（简化列表）
```http
GET /space/page/{pageId}/versions/all
```

---

### 4.3 获取指定版本
```http
GET /space/page/version/{versionId}
```

**路径参数:**
- `versionId`: 版本ID

---

### 4.4 回滚到指定版本
```http
POST /space/page/{pageId}/rollback
Content-Type: application/json
```

**路径参数:**
- `pageId`: 页面ID

**请求参数 (RollbackVersionDTO):**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| targetVersionId | Long | 是 | 目标版本ID |
| changeSummary | String | 否 | 回滚说明 |

---

### 4.5 对比两个版本
```http
POST /space/page/versions/compare
Content-Type: application/json
```

**请求参数 (CompareVersionDTO):**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sourceVersionId | Long | 是 | 源版本ID |
| targetVersionId | Long | 是 | 目标版本ID |

---

### 4.6 删除草稿版本
```http
DELETE /space/page/{pageId}/draft
```

---

### 4.7 获取版本数量
```http
GET /space/page/{pageId}/versions/count
```

---

## 五、Block Version 块版本接口

### 5.1 获取块的版本历史
```http
GET /space/page/block/{blockId}/versions
```

**路径参数:**
- `blockId`: 块ID

**响应示例:**
```json
{
  "code": 200,
  "success": true,
  "data": [
    {
      "id": 500,
      "blockId": "block_123",
      "pageId": 100,
      "pageVersion": "2",
      "version": 1,
      "type": "paragraph",
      "text": "这是更新后的文本",
      "createTime": "2024-01-02 15:30:00"
    }
  ]
}
```

---

### 5.2 获取某页面版本的所有块快照
```http
GET /space/page/version/{versionId}/blocks
```

**路径参数:**
- `versionId`: 页面版本ID

---

## 六、Backlink 反向链接接口

### 6.1 获取页面的反向链接
```http
GET /space/page/{id}/backlinks
```

**路径参数:**
- `id`: 页面ID

---

### 6.2 获取块的反向链接
```http
GET /space/block/{blockId}/backlinks
```

**路径参数:**
- `blockId`: 块ID

---

## 七、Collaboration 协作接口

### 7.1 获取空间成员
```http
GET /space/{id}/members
```

---

### 7.2 获取页面协作者
```http
GET /space/page/{pageId}/collaborators
```

---

### 7.3 更新协作者权限
```http
PUT /space/page/{pageId}/collaborator/{userId}/permission
Content-Type: application/json
```

**请求参数:**
```json
{
  "permission": "READ/WRITE/ADMIN"
}
```

---

### 7.4 移除协作者
```http
DELETE /space/page/{pageId}/collaborator/{userId}
```

---

### 7.5 创建协作邀请
```http
POST /space/collaborationInvitation
Content-Type: application/json
```

**请求参数 (CollaborationInvitationRequestDTO):**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| spaceId | Long | 是 | 空间ID |
| pageId | Long | 否 | 页面ID |
| collaboratorIds | List | 否 | 协作者用户ID列表 |
| collaboratorEmails | List | 否 | 协作者邮箱列表 |
| permissions | List | 否 | 权限列表 |
| message | String | 否 | 邀请消息 |

---

### 7.6 获取被邀请的页面
```http
GET /space/page/invited
```

---

### 7.7 生成分享链接
```http
POST /space/page/{pageId}/share-link
Content-Type: application/json
```

**请求参数 (ShareLinkRequestDTO):**
| 参数 | 类型 | 说明 |
|------|------|------|
| isPublic | Boolean | 是否公开 |
| permission | String | 权限(READ/WRITE) |
| expiresIn | Integer | 过期天数 |

---

## 八、错误码

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 500 | 服务器内部错误 |
| 400 | 参数错误 |
| 401 | 未授权 |
| 404 | 资源不存在 |

---

## 九、数据模型

### PageVO
```json
{
  "id": 100,
  "title": "页面标题",
  "spaceId": 1,
  "parentId": null,
  "content": "{\"type\":\"doc\",\"content\":[]}",
  "status": "ACTIVE",
  "draft": false,
  "icon": "file",
  "cover": null,
  "createTime": "2024-01-01 10:00:00",
  "updateTime": "2024-01-02 15:30:00"
}
```

### SpaceVO
```json
{
  "id": 1,
  "name": "空间名称",
  "icon": "folder",
  "description": "空间描述",
  "type": "SPACE",
  "favorite": false,
  "userId": 100,
  "createTime": "2024-01-01 10:00:00"
}
```

### PageBlockVO
```json
{
  "id": "block_123",
  "pageId": 100,
  "spaceId": 1,
  "spaceName": "空间名称",
  "pageTitle": "页面标题",
  "type": "paragraph",
  "content": []
}
```

### PageBlockDetailVO
```json
{
  "id": "block_123",
  "type": "paragraph",
  "pageId": 100,
  "pageTitle": "页面标题",
  "spaceId": 1,
  "text": "块文本内容",
  "attrs": {},
  "marks": [],
  "parentId": "root",
  "path": "0",
  "fullPath": "0.1.2"
}
```

### PageVersion
```json
{
  "id": 1000,
  "subjectId": 100,
  "version": "2",
  "status": "ACTIVE",
  "title": "页面标题",
  "changeSummary": "更新说明",
  "md5Code": "abc123",
  "createUser": 1,
  "createTime": "2024-01-01 10:00:00"
}
```

### BlockVersion
```json
{
  "id": 500,
  "blockId": "block_123",
  "pageId": 100,
  "pageVersionId": 1000,
  "pageVersion": "2",
  "version": 1,
  "type": "paragraph",
  "text": "块文本",
  "createTime": "2024-01-01 10:00:00"
}
```
