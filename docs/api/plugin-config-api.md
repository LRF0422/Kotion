# 插件配置 API 设计文档

## 概述

提供插件配置的持久化存储能力，每个插件以 `pluginKey` 为唯一标识，存储一份 JSON 配置。

前端采用 **Hybrid Storage** 策略：优先调用后端 API，失败时降级到 localStorage。后端 API 就绪前，前端已可通过 localStorage 完整运行。

---

## 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/knowledge-wiki/plugin-config/:pluginKey` | 获取单个插件配置 |
| `POST` | `/knowledge-wiki/plugin-config/:pluginKey` | 保存/更新单个插件配置 |
| `GET` | `/knowledge-wiki/plugin-config` | 批量获取当前用户所有插件配置 |

> **为什么用 POST 而非 PUT？**
> 现有 `handleHttpRequest` 的 PUT 分支不传 `body`，因此新端点统一使用 POST。

---

## 1. 获取单个插件配置

```
GET /knowledge-wiki/plugin-config/:pluginKey
```

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pluginKey` | string | 是 | 插件唯一标识，如 `ai-assistant` |

### 成功响应 200

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "userId": 10001,
    "pluginKey": "ai-assistant",
    "config": {
      "apiEndpoint": "https://api.deepseek.com/v1/chat/completions",
      "apiKey": "sk-***",
      "enableAutoComplete": true
    },
    "createdAt": "2025-06-01T10:00:00Z",
    "updatedAt": "2025-06-15T14:30:00Z"
  }
}
```

### 未找到 404

```json
{
  "code": 404,
  "message": "Plugin config not found",
  "data": null
}
```

---

## 2. 保存/更新插件配置

```
POST /knowledge-wiki/plugin-config/:pluginKey
```

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pluginKey` | string | 是 | 插件唯一标识 |

### 请求体

```json
{
  "config": {
    "apiEndpoint": "https://api.deepseek.com/v1/chat/completions",
    "apiKey": "sk-xxx",
    "enableAutoComplete": true,
    "maxTokens": "4096"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `config` | object | 是 | 任意 JSON 对象，由插件自行定义结构 |

### 成功响应 200

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "userId": 10001,
    "pluginKey": "ai-assistant",
    "config": { ... },
    "createdAt": "2025-06-01T10:00:00Z",
    "updatedAt": "2025-06-15T14:30:00Z"
  }
}
```

### 逻辑说明

- 如果 `(userId, pluginKey)` 已存在，则更新 `config` 和 `updatedAt`
- 如果不存在，则新增一条记录（UPSERT 语义）

---

## 3. 批量获取所有插件配置

```
GET /knowledge-wiki/plugin-config
```

### 成功响应 200

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "pluginKey": "ai-assistant",
      "config": { ... },
      "updatedAt": "2025-06-15T14:30:00Z"
    },
    {
      "pluginKey": "excalidraw",
      "config": { ... },
      "updatedAt": "2025-06-10T09:00:00Z"
    }
  ]
}
```

### 说明

- 返回当前登录用户的所有插件配置
- 用于应用启动时批量预加载（`PluginConfigStore.initialize()`）

---

## 数据库设计

### 表 `kn_plugin_config`

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主键 |
| `user_id` | BIGINT | NOT NULL | 用户 ID |
| `plugin_key` | VARCHAR(128) | NOT NULL | 插件标识 |
| `config` | JSON / TEXT | NOT NULL | 配置 JSON |
| `created_at` | DATETIME | NOT NULL, DEFAULT NOW() | 创建时间 |
| `updated_at` | DATETIME | NOT NULL, DEFAULT NOW() ON UPDATE | 更新时间 |

### 索引

```sql
-- 唯一约束：每个用户每个插件只有一条配置
CREATE UNIQUE INDEX uk_user_plugin ON kn_plugin_config(user_id, plugin_key);
```

### 建表 SQL（MySQL）

```sql
CREATE TABLE `kn_plugin_config` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL COMMENT '用户ID',
  `plugin_key` VARCHAR(128) NOT NULL COMMENT '插件标识',
  `config` JSON NOT NULL COMMENT '配置JSON',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_plugin` (`user_id`, `plugin_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='插件配置表';
```

---

## 错误码

| HTTP 状态码 | code | 说明 |
|-------------|------|------|
| 200 | 200 | 成功 |
| 400 | 400 | 请求参数错误（如 config 缺失） |
| 401 | 401 | 未登录 |
| 404 | 404 | 配置不存在（仅 GET 单个） |
| 500 | 500 | 服务端异常 |

---

## Electron IPC 通道映射

| IPC 通道 | 说明 |
|----------|------|
| `pluginConfig:getAll` | 对应 `GET /knowledge-wiki/plugin-config` |
| `pluginConfig:getOrSave` | 对应 `GET/POST /knowledge-wiki/plugin-config/:pluginKey`，根据请求数据区分读/写 |

---

## 安全说明

- 用户只能访问自己的配置，接口通过 Token 鉴权获取 `userId`
- `config` 字段中可能包含 API Key 等敏感信息，后端应考虑加密存储或脱敏返回
- 前端 localStorage 同样存储配置副本，属于客户端缓存，安全等级由浏览器保障
