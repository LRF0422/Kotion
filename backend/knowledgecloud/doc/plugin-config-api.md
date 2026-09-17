# 插件配置 API 设计文档

## 概述

提供插件配置的持久化存储能力，每个插件以 `pluginKey` 为唯一标识，存储一份 JSON 配置。

前端采用 **Hybrid Storage** 策略：优先调用后端 API，失败时降级到 localStorage。后端 API 就绪前，前端已可通过 localStorage 完整运行。

---

## 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/knowledge-wiki/plugin-config/:pluginKey` | 获取单个插件配置（密钥脱敏） |
| `POST` | `/knowledge-wiki/plugin-config/:pluginKey` | 保存/更新单个插件配置 |
| `GET` | `/knowledge-wiki/plugin-config` | 批量获取当前用户所有插件配置 |
| `GET` | `/knowledge-wiki/plugin-config/:pluginKey/reveal` | 解密下发单个插件配置中的密钥 |

> **为什么用 POST 而非 PUT？**
> 现有 `handleHttpRequest` 的 PUT 分支不传 `body`，因此新端点统一使用 POST。

## 密钥字段约定

插件配置中可能包含 API Key、Personal Access Token、Access Secret、账号 Cookie
等敏感字段。这些字段：

- **不落明文**：写入时从 `config` 中剥离，AES-256-GCM 加密后存入独立的
  `secret_config` 列；
- **不随读返回**：`GET` 接口中每个已配置的密钥字段返回哨兵值
  `__KN_SECRET_MASK__`，并在 `secretFields` 中列出字段名；
- **保存语义**：POST 时传哨兵值 = 保持原值不变，传真实值 = 覆盖，传 `""` / `null` =
  清除，不带该字段 = 保持原值；
- **按需解密**：仅 `GET /:pluginKey/reveal` 返回明文，供浏览器直连第三方 API 的场景
  使用，调用方必须只在内存中持有，禁止持久化或打日志。

字段是否属于密钥由服务端判定：插件注册表（`ai-settings` → `apiKey`、
`github-settings` → `personalAccessToken`、`zhihu-settings` → `accessSecret`、
`netease-music-settings` → `cookie`）并集上名称启发式（`…Key`/`…Secret`/`…Token`/
`password`/`cookie`/`authorization` 等）。前端应声明同一份字段清单，忘声明时仍会被
加密而不是明文落库。

> **部署要求**：必须配置 `knowledge.plugin-config.crypto-key`（或环境变量
> `KN_PLUGIN_CONFIG_CRYPTO_KEY`），值为 Base64 编码的 32 字节密钥，或一段口令
> （按 SHA-256 拉伸）。未配置时服务端**拒绝保存**含密钥的配置，而不是降级明文；
> 请妥善备份该密钥，丢失后已存密钥无法解密。

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
      "apiKey": "__KN_SECRET_MASK__",
      "enableAutoComplete": true
    },
    "secretFields": ["apiKey"],
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
| `config` | object | 是 | 任意 JSON 对象，由插件自行定义结构；密钥字段遵循上方「密钥字段约定」 |

### 成功响应 200

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "userId": 10001,
    "pluginKey": "ai-assistant",
    "config": { "apiKey": "__KN_SECRET_MASK__", "...": "..." },
    "secretFields": ["apiKey"],
    "createdAt": "2025-06-01T10:00:00Z",
    "updatedAt": "2025-06-15T14:30:00Z"
  }
}
```

### 逻辑说明

- 如果 `(userId, pluginKey)` 已存在，则更新 `config` / `secret_config` 和 `updatedAt`
- 如果不存在，则新增一条记录（UPSERT 语义）
- 密钥字段从 `config` 剥离后加密写入 `secret_config`；响应只回哨兵值

### 失败响应 500

服务端未配置加密密钥而请求体中含密钥时，**拒绝写入**（不落明文）：

```json
{
  "code": 500,
  "message": "Plugin credential encryption is not configured on the server; the configuration was not saved.",
  "data": null
}
```

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
- 密钥字段同样只返回哨兵值，明文需走 `/:pluginKey/reveal`

---

## 4. 按需解密下发密钥

```
GET /knowledge-wiki/plugin-config/:pluginKey/reveal
```

### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pluginKey` | string | 是 | 插件唯一标识 |

### 成功响应 200

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "secrets": {
      "personalAccessToken": "ghp_xxx"
    }
  }
}
```

### 说明

- 与其它端点一样按 JWT 用户隔离，只能取到调用者自己保存的密钥
- 记录不存在或未配置密钥时返回 `secrets: {}`
- 前端拿到后只能放在内存中（如 `PluginConfigStore.getSecrets()`），**禁止**写入
  localStorage 或日志；该响应不应被任何中间层缓存

---

## 数据库设计

### 表 `wiki_plugin_config`

> 实际落库表名为 `wiki_plugin_config`（复用 wiki 模块命名前缀），建表脚本位于 [doc/sql/blade/plugin-config.sql](./sql/blade/plugin-config.sql)。

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGINT | PK, AUTO_INCREMENT | 主键 |
| `user_id` | BIGINT | NOT NULL | 用户 ID |
| `plugin_key` | VARCHAR(128) | NOT NULL | 插件标识 |
| `config` | JSON | NOT NULL | 非敏感配置 JSON |
| `secret_config` | TEXT | NULL | AES-256-GCM 加密后的密钥 JSON（`v1:base64(iv‖ciphertext‖tag)`），无密钥时为 NULL |
| `create_user` | BIGINT | NULL | 创建人（Blade 审计字段） |
| `create_time` | DATETIME | NOT NULL, DEFAULT NOW() | 创建时间 → 对外 `createdAt` |
| `update_user` | BIGINT | NULL | 更新人（Blade 审计字段） |
| `update_time` | DATETIME | NOT NULL, DEFAULT NOW() ON UPDATE | 更新时间 → 对外 `updatedAt` |
| `status` | INT | NOT NULL, DEFAULT 1 | 状态 |
| `is_deleted` | INT | NOT NULL, DEFAULT 0 | 逻辑删除标记 |
| `tenant_id` | VARCHAR(12) | DEFAULT '000000' | 租户 ID |

### 存量数据迁移

`secret_config` 由 [script/migration/V35__plugin_config_secrets.sql](../script/migration/V35__plugin_config_secrets.sql)
新增。历史行里仍是明文的密钥字段，由服务端在**首次读取该行时**自动加密迁移：加密写入
`secret_config`、从 `config` 中删除，对用户完全无感。迁移需要应用侧密钥，因此没有
纯 SQL 回填；加密密钥未配置时迁移会被跳过并打 ERROR 日志，读取仍只返回哨兵值
（绝不回传明文），但库中明文会保留到密钥配置完成。

### 索引

```sql
-- 唯一约束：每个用户每个插件只有一条配置
CREATE UNIQUE INDEX uk_user_plugin ON wiki_plugin_config(user_id, plugin_key);
CREATE INDEX idx_user_id ON wiki_plugin_config(user_id);
```

### 建表 SQL（MySQL）

```sql
CREATE TABLE `wiki_plugin_config` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT NOT NULL COMMENT 'User ID',
  `plugin_key` VARCHAR(128) NOT NULL COMMENT 'Plugin identifier',
  `config` JSON NOT NULL COMMENT 'Configuration JSON',
  `create_user` BIGINT DEFAULT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_user` BIGINT DEFAULT NULL,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `status` INT NOT NULL DEFAULT 1,
  `is_deleted` INT NOT NULL DEFAULT 0,
  `tenant_id` VARCHAR(12) DEFAULT '000000',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_plugin` (`user_id`, `plugin_key`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='插件配置表';
```

> `uk_user_plugin` 由后端 `saveOrUpdate` 在并发插入场景下主动依赖：捕获 `DuplicateKeyException` 后退化为 `UPDATE`，避免重复记录。

---

## 错误码

响应体统一使用 `R<T>` 包装：`{ code, success, msg, data }`。HTTP 状态码对 `GET /:pluginKey` 命中空记录时仍为 `200`，但业务 `code` 为 `404`，便于前端判定“首次安装”。

| HTTP 状态码 | code | 说明 |
|-------------|------|------|
| 200 | 200 | 成功 |
| 200 | 404 | `GET /:pluginKey` 当前用户尚未保存该插件配置（走 `Hybrid Storage` 默认值） |
| 400 | 400 | 请求参数错误（`config` 缺失、`pluginKey` 不符合 `^[A-Za-z0-9._-]+$` 或长度 > 128） |
| 401 | 401 | 未登录 / token 无效 |
| 500 | 500 | 服务端异常；或未配置加密密钥而请求含密钥（拒绝明文落库） |

---

## Electron IPC 通道映射

| IPC 通道 | 说明 |
|----------|------|
| `pluginConfig:getAll` | 对应 `GET /knowledge-wiki/plugin-config` |
| `pluginConfig:getOrSave` | 对应 `GET/POST /knowledge-wiki/plugin-config/:pluginKey`，根据请求数据区分读/写 |

---

## 安全说明

- 用户只能访问自己的配置，接口通过 Token 鉴权获取 `userId`
- 密钥字段 AES-256-GCM 加密存储于 `secret_config`，读接口只返回哨兵值
  `__KN_SECRET_MASK__`；明文仅通过 `/:pluginKey/reveal` 按需下发，供浏览器直连
  第三方 API 的场景使用
- 加密密钥来自 `knowledge.plugin-config.crypto-key`（或 `KN_PLUGIN_CONFIG_CRYPTO_KEY`），
  必须随部署妥善保管与备份；未配置时含密钥的保存会被拒绝（fail-closed），不会降级为明文
- 历史明文数据在首次读取时自动加密迁移，迁移失败（密钥缺失）时不会向客户端回传明文
- 前端 localStorage 只保存脱敏后的副本（密钥位为哨兵值），明文密钥仅存在于内存；
  登出/切换工作区时会清空内存中的密钥缓存
