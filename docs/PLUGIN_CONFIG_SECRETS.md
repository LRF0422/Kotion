# 插件配置中的密钥处理

插件配置（`PluginConfigStore` / `wiki_plugin_config`）以前会把整份配置——包括
`apiKey`、`personalAccessToken`、`accessSecret`、账号 `cookie`——**明文**写进
`localStorage` 和 MySQL 的 `config` 列，并在 `GET` 接口原样返回。现在这条链路已经
端到端加密 + 脱敏。

## 一句话契约

> 明文密钥只存在于两处：请求体（客户端 → 服务端）和内存。落库是密文，读接口是掩码，
> 需要用时通过 `reveal` 接口按需下发。

## 数据流

```
                      ┌──────────── 前端（浏览器 / Electron）────────────┐
用户输入 sk-xxx ──► usePluginConfig 表单态（内存）
                      │  saveConfig()
                      ▼
              PluginConfigStore.redact()
                      ├─► 内存密钥缓存（仅内存，登出清空）
                      ├─► localStorage：密钥位写 __KN_SECRET_MASK__
                      └─► POST /plugin-config/:key  （含明文，走 TLS）
                                  │
                                  ▼
                      ┌──────────── 后端（knowledge-wiki）────────────┐
                      POST：按注册表 + 名称启发式挑出密钥字段
                            ├─ config           ← 非敏感字段
                            └─ secret_config    ← AES-256-GCM(v1:base64(iv‖ct‖tag))
                      GET ：config 中密钥位统一返回 __KN_SECRET_MASK__
                      GET /:key/reveal：返回明文，供前端直连第三方 API
```

## 保存语义

| POST 中密钥字段的取值 | 效果 |
|---|---|
| `__KN_SECRET_MASK__` | 保持原值（未编辑时前端回传的就是它） |
| 真实值 | 覆盖 |
| `""` / `null` | 清除 |
| 不带该字段 | 保持原值 |

正因如此，前端可以整份配置回传，不需要为密钥做特殊 diff。

## 关键文件

| 位置 | 职责 |
|---|---|
| `packages/common/src/services/plugin-secrets.ts` | 掩码常量、字段识别、脱敏/提取、内存密钥缓存 |
| `packages/common/src/services/plugin-config-service.ts` | Store：本地脱敏落盘、存量明文迁移、按需 `getSecret` |
| `packages/common/src/services/plugin-config-api-storage.ts` | API 适配器 + 安装默认存储（与 Store 核心解耦以便 Node 侧测试） |
| `packages/common/src/hooks/use-plugin-config.ts` | Hook：`secretFields` 声明、`getSecret`、`isConfigured` |
| `knowledge-wiki/.../security/PluginSecretFields.java` | 服务端字段注册表 + 同名启发式 |
| `knowledge-wiki/.../security/PluginConfigCryptoService.java` | AES-256-GCM 加解密 |
| `knowledge-wiki/.../application/PluginConfigApplication.java` | 拆分/加密/脱敏/迁移/reveal |

## 新增一个带密钥的插件

1. 前端在 `usePluginConfig({ ..., secretFields: ['yourSecret'] })` 中声明（Hook 会把它
   注册到 Store，用于本地脱敏与「已配置」判定）。
2. 设置面板里用 `isSecretMask(config.yourSecret)` 判断是否已配置，把输入框渲染成
   「已配置（留空保持不变）」，不要直接把掩码显示出来。
3. 运行时需要明文时用 `getSecret('yourSecret')`（Store）或 `usePluginConfig` 返回的
   `getSecret`，**不要**从 `config` 里读。
4. 后端在 `PluginSecretFields.DECLARED` 注册 `pluginKey → 字段名`。
   即使忘记注册，名称启发式也会兜住（会加密而不是明文落库），但注册后才能保证
   「解密失败时仍标记为已配置」。

## 部署要求（重要）

必须配置加密密钥，否则**含密钥的保存会被拒绝**（fail-closed，绝不降级明文）：

```yaml
knowledge:
  plugin-config:
    crypto-key: ${KN_PLUGIN_CONFIG_CRYPTO_KEY}
```

- 取值：Base64 编码的 32 字节密钥，或一段口令（按 SHA-256 拉伸）。
- **务必备份**：密钥丢失后已存密钥无法解密（读接口会打 ERROR 日志并只返回掩码）。
- 未配置时的行为：不含密钥的配置照常读写；含密钥的保存返回 500 并给出明确提示；
  存量明文行不会被迁移，但读接口**不会**把明文回传给客户端。

## 存量数据迁移

- **服务端**：首次读取某行时，若发现 `config` 里仍有明文密钥，则加密写入
  `secret_config` 并从 `config` 删除（对用户无感）。见
  `script/migration/V35__plugin_config_secrets.sql`。
- **客户端**：首次加载某个插件配置时，若 `localStorage` 里仍是明文，会先把整份配置
  推给服务端（由服务端加密），再把本地副本改写为掩码。若服务端不可达，本地保持原样
  而不是丢数据，下次加载/保存时重试。

## 验证

```bash
pnpm --filter @kn/common check:plugin-secrets
```

覆盖：字段识别（含 `maxTokens` 这类误报防护）、脱敏、localStorage 不落明文、按需
reveal 与缓存、存量明文迁移、迁移失败不丢数据、清除密钥后内存缓存失效。

## 已知边界

- 浏览器直连第三方 API 的插件（GitHub、知乎）必须把明文拿进内存，因此 XSS 仍可读取；
  本方案消除的是**静态存储**与**接口回显**两条泄漏路径，不是内存中的密钥。
- 密钥未做轮换（`v1:` 前缀为将来的轮换/多版本预留）。
- `reveal` 接口只做 JWT 鉴权 + 用户隔离，没有二次验证；如需要，可在网关或该接口上
  再加一步 re-auth。
