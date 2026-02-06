# Skills API 接口文档

## 概述

Skills API 提供用户自定义技能的存储、管理和市场功能。支持技能的安装、卸载、启用/禁用、分享等操作。

**Base URL**: `/api/skills`

**认证方式**: Bearer Token (在 Header 中传递 `Authorization: Bearer <token>`)

---

## 数据模型

### Skill (技能定义)

```typescript
interface Skill {
    id: string              // 唯一标识符
    name: string            // 技能名称（英文，用于代码引用）
    displayName: string     // 显示名称
    description: string     // 技能描述
    version: string         // 版本号 (semver)
    author?: string         // 作者
    homepage?: string       // 主页/文档链接
    requiredTools: string[] // 必需工具列表
    optionalTools?: string[] // 可选工具列表
    systemPromptFragment?: string // 专用 System Prompt 片段
    tags?: string[]         // 标签
    createdAt?: string      // 创建时间 (ISO 8601)
    updatedAt?: string      // 更新时间 (ISO 8601)
}
```

### InstalledSkill (已安装技能)

```typescript
interface InstalledSkill extends Skill {
    installedAt: string     // 安装时间 (ISO 8601)
    enabled: boolean        // 是否启用
    source: 'marketplace' | 'custom' | 'import'  // 来源
    sourceUrl?: string      // 来源 URL（如果从 URL 安装）
}
```

### MarketplaceSkill (市场技能)

```typescript
interface MarketplaceSkill extends Skill {
    downloads: number       // 下载次数
    rating: number          // 评分 (0-5)
    ratingCount: number     // 评分人数
    verified: boolean       // 是否官方认证
    featured: boolean       // 是否推荐
    category: string        // 分类
    previewImage?: string   // 预览图 URL
}
```

---

## 接口列表

### 1. 已安装技能管理

#### 1.1 获取已安装技能列表

获取当前用户已安装的所有技能。

```
GET /api/skills/installed
```

**Query Parameters:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| enabled | boolean | 否 | 筛选启用状态 |
| source | string | 否 | 筛选来源类型 |
| tag | string | 否 | 按标签筛选 |

**Response:**

```json
{
    "success": true,
    "data": {
        "skills": [
            {
                "id": "translation-assistant",
                "name": "translation-assistant",
                "displayName": "翻译助手",
                "description": "多语言翻译技能",
                "version": "1.0.0",
                "author": "Knowledge Repo",
                "requiredTools": ["getDocumentStructure", "readChunk", "replaceContent"],
                "optionalTools": ["webSearch"],
                "systemPromptFragment": "## Translation Mode...",
                "tags": ["translation", "language"],
                "installedAt": "2024-01-15T10:30:00Z",
                "enabled": true,
                "source": "marketplace",
                "sourceUrl": "https://skills.example.com/translation.json"
            }
        ],
        "total": 1,
        "enabledCount": 1
    }
}
```

---

#### 1.2 批量保存已安装技能

保存/同步用户的已安装技能列表（用于客户端同步）。

```
PUT /api/skills/installed
```

**Request Body:**

```json
{
    "skills": [
        {
            "id": "translation-assistant",
            "name": "translation-assistant",
            "displayName": "翻译助手",
            "description": "多语言翻译技能",
            "version": "1.0.0",
            "requiredTools": ["getDocumentStructure", "readChunk"],
            "installedAt": "2024-01-15T10:30:00Z",
            "enabled": true,
            "source": "marketplace"
        }
    ]
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "savedCount": 1,
        "skills": [...]
    }
}
```

---

#### 1.3 安装技能

安装一个新技能。

```
POST /api/skills/installed
```

**Request Body:**

```json
{
    "skill": {
        "id": "my-custom-skill",
        "name": "my-custom-skill",
        "displayName": "我的技能",
        "description": "自定义技能描述",
        "version": "1.0.0",
        "requiredTools": ["tool1", "tool2"],
        "systemPromptFragment": "专用指令..."
    },
    "source": "custom",
    "sourceUrl": null
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "skill": {
            "id": "my-custom-skill",
            "installedAt": "2024-01-15T10:30:00Z",
            "enabled": true,
            ...
        }
    },
    "message": "技能安装成功"
}
```

**Error Response (技能已存在):**

```json
{
    "success": false,
    "error": {
        "code": "SKILL_ALREADY_INSTALLED",
        "message": "技能已安装"
    }
}
```

---

#### 1.4 卸载技能

卸载指定技能。

```
DELETE /api/skills/installed/:skillId
```

**Path Parameters:**

| 参数 | 类型 | 描述 |
|------|------|------|
| skillId | string | 技能 ID |

**Response:**

```json
{
    "success": true,
    "message": "技能已卸载"
}
```

---

#### 1.5 更新技能状态

启用/禁用技能或更新技能信息。

```
PATCH /api/skills/installed/:skillId
```

**Path Parameters:**

| 参数 | 类型 | 描述 |
|------|------|------|
| skillId | string | 技能 ID |

**Request Body:**

```json
{
    "enabled": false
}
```

或更新其他字段：

```json
{
    "displayName": "新名称",
    "systemPromptFragment": "更新的指令..."
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "skill": {
            "id": "my-skill",
            "enabled": false,
            "updatedAt": "2024-01-15T11:00:00Z",
            ...
        }
    }
}
```

---

#### 1.6 获取单个已安装技能

获取指定技能的详细信息。

```
GET /api/skills/installed/:skillId
```

**Response:**

```json
{
    "success": true,
    "data": {
        "skill": {
            "id": "translation-assistant",
            ...
        }
    }
}
```

---

### 2. 技能市场

#### 2.1 浏览市场技能

获取市场中可用的技能列表。

```
GET /api/skills/marketplace
```

**Query Parameters:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20，最大 100 |
| category | string | 否 | 分类筛选 |
| tag | string | 否 | 标签筛选 |
| search | string | 否 | 搜索关键词 |
| sort | string | 否 | 排序：`popular` / `recent` / `rating` |
| featured | boolean | 否 | 只显示推荐技能 |
| verified | boolean | 否 | 只显示认证技能 |

**Response:**

```json
{
    "success": true,
    "data": {
        "skills": [
            {
                "id": "translation-assistant",
                "name": "translation-assistant",
                "displayName": "翻译助手",
                "description": "多语言翻译技能 - 支持中英日韩等多种语言",
                "version": "1.0.0",
                "author": "Knowledge Repo",
                "requiredTools": ["getDocumentStructure", "readChunk", "replaceContent"],
                "tags": ["translation", "language", "i18n"],
                "downloads": 1500,
                "rating": 4.8,
                "ratingCount": 120,
                "verified": true,
                "featured": true,
                "category": "writing",
                "previewImage": "https://cdn.example.com/skills/translation-preview.png"
            }
        ],
        "pagination": {
            "page": 1,
            "pageSize": 20,
            "total": 45,
            "totalPages": 3
        }
    }
}
```

---

#### 2.2 获取市场技能详情

获取单个市场技能的完整信息（包括安装用的完整定义）。

```
GET /api/skills/marketplace/:skillId
```

**Response:**

```json
{
    "success": true,
    "data": {
        "skill": {
            "id": "translation-assistant",
            "name": "translation-assistant",
            "displayName": "翻译助手",
            "description": "多语言翻译技能 - 支持中英日韩等多种语言的翻译和润色",
            "version": "1.0.0",
            "author": "Knowledge Repo",
            "homepage": "https://docs.example.com/skills/translation",
            "requiredTools": ["getDocumentStructure", "readChunk", "searchInDocument", "replaceContent", "askUserChoice"],
            "optionalTools": ["webSearch", "insertNear"],
            "systemPromptFragment": "## Translation Assistant Skill Active\n\nYou are now in translation mode...",
            "tags": ["translation", "language", "i18n"],
            "downloads": 1500,
            "rating": 4.8,
            "ratingCount": 120,
            "verified": true,
            "featured": true,
            "category": "writing",
            "createdAt": "2024-01-01T00:00:00Z",
            "updatedAt": "2024-01-10T00:00:00Z"
        },
        "isInstalled": false,
        "relatedSkills": [
            {
                "id": "writing-enhancement",
                "displayName": "写作增强"
            }
        ]
    }
}
```

---

#### 2.3 获取市场分类

获取市场技能分类列表。

```
GET /api/skills/marketplace/categories
```

**Response:**

```json
{
    "success": true,
    "data": {
        "categories": [
            {
                "id": "writing",
                "name": "写作辅助",
                "description": "提升写作质量的技能",
                "icon": "pencil",
                "skillCount": 15
            },
            {
                "id": "coding",
                "name": "编程开发",
                "description": "代码相关技能",
                "icon": "code",
                "skillCount": 12
            },
            {
                "id": "productivity",
                "name": "效率工具",
                "description": "提高工作效率的技能",
                "icon": "zap",
                "skillCount": 8
            },
            {
                "id": "language",
                "name": "语言处理",
                "description": "翻译、校对等语言技能",
                "icon": "globe",
                "skillCount": 6
            }
        ]
    }
}
```

---

#### 2.4 从市场安装技能

一键从市场安装技能到用户账户。

```
POST /api/skills/marketplace/:skillId/install
```

**Response:**

```json
{
    "success": true,
    "data": {
        "skill": {
            "id": "translation-assistant",
            "installedAt": "2024-01-15T10:30:00Z",
            "enabled": true,
            "source": "marketplace",
            ...
        }
    },
    "message": "技能安装成功"
}
```

---

#### 2.5 评价市场技能

对已安装的市场技能进行评分。

```
POST /api/skills/marketplace/:skillId/rate
```

**Request Body:**

```json
{
    "rating": 5,
    "comment": "非常好用的翻译技能！"
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "newRating": 4.85,
        "ratingCount": 121
    },
    "message": "评价成功"
}
```

---

### 3. 技能分享

#### 3.1 分享技能到市场

将自定义技能提交到市场（需审核）。

```
POST /api/skills/share
```

**Request Body:**

```json
{
    "skillId": "my-custom-skill",
    "category": "writing",
    "previewImage": "base64...",
    "readme": "# 使用说明\n\n这是一个..."
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "submissionId": "sub_123456",
        "status": "pending_review"
    },
    "message": "技能已提交审核"
}
```

---

#### 3.2 生成分享链接

生成技能的分享链接（不通过市场，直接分享 JSON）。

```
POST /api/skills/installed/:skillId/share-link
```

**Request Body:**

```json
{
    "expiresIn": 604800
}
```

**Response:**

```json
{
    "success": true,
    "data": {
        "shareUrl": "https://api.example.com/skills/shared/abc123",
        "expiresAt": "2024-01-22T10:30:00Z"
    }
}
```

---

#### 3.3 获取分享的技能

通过分享链接获取技能定义（无需认证）。

```
GET /api/skills/shared/:shareId
```

**Response:**

```json
{
    "success": true,
    "data": {
        "skill": {
            "id": "my-custom-skill",
            "name": "my-custom-skill",
            "displayName": "我的技能",
            ...
        },
        "sharedBy": "用户A",
        "expiresAt": "2024-01-22T10:30:00Z"
    }
}
```

---

## 错误码

| 错误码 | HTTP 状态码 | 描述 |
|--------|-------------|------|
| `UNAUTHORIZED` | 401 | 未授权访问 |
| `SKILL_NOT_FOUND` | 404 | 技能不存在 |
| `SKILL_ALREADY_INSTALLED` | 409 | 技能已安装 |
| `INVALID_SKILL_FORMAT` | 400 | 技能格式无效 |
| `MISSING_REQUIRED_FIELDS` | 400 | 缺少必填字段 |
| `SHARE_LINK_EXPIRED` | 410 | 分享链接已过期 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

**错误响应格式:**

```json
{
    "success": false,
    "error": {
        "code": "SKILL_NOT_FOUND",
        "message": "技能不存在",
        "details": {
            "skillId": "invalid-id"
        }
    }
}
```

---

## 数据库表设计建议

### user_skills (用户已安装技能)

```sql
CREATE TABLE user_skills (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id         BIGINT NOT NULL,
    skill_id        VARCHAR(100) NOT NULL,
    skill_data      JSON NOT NULL,          -- 完整的技能定义 JSON
    enabled         BOOLEAN DEFAULT TRUE,
    source          ENUM('marketplace', 'custom', 'import') NOT NULL,
    source_url      VARCHAR(500),
    installed_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_user_skill (user_id, skill_id),
    INDEX idx_user_id (user_id),
    INDEX idx_enabled (user_id, enabled)
);
```

### marketplace_skills (市场技能)

```sql
CREATE TABLE marketplace_skills (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    skill_id        VARCHAR(100) NOT NULL UNIQUE,
    skill_data      JSON NOT NULL,
    category        VARCHAR(50) NOT NULL,
    author_id       BIGINT,
    downloads       INT DEFAULT 0,
    rating_sum      DECIMAL(10,2) DEFAULT 0,
    rating_count    INT DEFAULT 0,
    verified        BOOLEAN DEFAULT FALSE,
    featured        BOOLEAN DEFAULT FALSE,
    status          ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    preview_image   VARCHAR(500),
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_category (category),
    INDEX idx_featured (featured, downloads DESC),
    INDEX idx_status (status)
);
```

### skill_ratings (技能评分)

```sql
CREATE TABLE skill_ratings (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    skill_id        VARCHAR(100) NOT NULL,
    user_id         BIGINT NOT NULL,
    rating          TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_user_skill_rating (user_id, skill_id),
    INDEX idx_skill_id (skill_id)
);
```

### skill_shares (分享链接)

```sql
CREATE TABLE skill_shares (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    share_id        VARCHAR(50) NOT NULL UNIQUE,
    skill_id        VARCHAR(100) NOT NULL,
    user_id         BIGINT NOT NULL,
    skill_data      JSON NOT NULL,
    expires_at      DATETIME NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_share_id (share_id),
    INDEX idx_expires_at (expires_at)
);
```

---

## 前端集成示例

```typescript
// 使用 ApiSkillStorage 适配器
import { ApiSkillStorage, SkillRegistry } from '@kn/core'

const storage = new ApiSkillStorage(
    '/api/skills',
    () => ({
        'Authorization': `Bearer ${getToken()}`
    })
)

const registry = new SkillRegistry(storage)
await registry.initialize()

// 安装技能
await registry.install(skillData, 'marketplace', sourceUrl)

// 获取已安装技能
const skills = registry.getInstalled()
```

---

## 注意事项

1. **安全性**:
   - `systemPromptFragment` 需要审核，防止注入恶意指令
   - 限制单个用户安装技能数量（建议 50 个）
   - 分享链接需要设置过期时间

2. **性能**:
   - 市场列表接口需要缓存
   - 用户技能列表可考虑客户端缓存

3. **兼容性**:
   - `requiredTools` 中的工具名需要与前端工具注册表匹配
   - 版本升级时需要考虑向后兼容

4. **国际化**:
   - `displayName` 和 `description` 可考虑支持多语言
