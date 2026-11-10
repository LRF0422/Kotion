# LLM Provider 配置（OpenAI 兼容）

Agent 只通过 OpenAI 兼容的 `POST .../chat/completions` 调模型，所有厂家差异都收敛在
`agent.providers.*` 这一组配置里（生产通常放在 Nacos 共享配置，`application.yml` 只留注释示例）。
本文是通用配置说明：换任意第三方厂家（DeepSeek 官方、硅基流动、阿里云百炼、火山方舟、智谱、
联通云 AI 网关、公司内部中转……）都只改配置，不改代码。

相关代码：

| 文件 | 职责 |
|------|------|
| `llm/LlmClientFactory.java` | 读 `agent.providers.*`，建客户端，启动时打印每个 provider 的真实 endpoint |
| `llm/ChatEndpoint.java` | `base-url` + `chat-path` 归一化（本文第 2 节） |
| `llm/OpenAiCompatibleClient.java` | 真正发请求；错误日志带 provider + 真实 URL + 响应体 |
| `llm/ModelConfig.java` | 单模型配置：`aliases` / `vision` / `extra` |

---

## 1. 最小可用配置

```yaml
agent:
  default-provider: deepseek          # 不指定模型时用哪个 provider
  default-model: deepseek-v3          # 必须和下面 models[].name 对得上
  providers:
    deepseek:                         # provider 名字，可任意取（不要和真实厂家重名冲突即可）
      base-url: https://aigw-gzgy2.cucloud.cn:8443/v1
      api-key: ${DEEPSEEK_API_KEY:}
      models:
        - name: deepseek-v3           # 厂家文档里的模型 id，原样填
```

- `base-url` 必须是带 scheme 的绝对 http(s) URL；非法值在**启动时**直接报错
  （`Invalid LLM provider 'x': ...`），不会拖到第一次对话才 404。
- `api-key` 建议用环境变量占位符，不要把明文写进 Nacos。
- `models[].name` 是发给厂家的**唯一定真模型 id**；`/api/v1/models`、前端模型下拉、日志都只出现它。

---

## 2. `base-url` / `chat-path` 怎么填（重点）

不同厂家给的 base URL 形态不一样，历史实现是直接字符串拼接，`base-url` 已经带 `/v1` 时就会
拼出 `.../v1/v1/chat/completions` —— 网关对不存在的路径返回 **404**，这就是
「接入第三方厂家 DeepSeek 模型报 404」最常见的原因。

现在由 `ChatEndpoint.resolve()` 归一化，下面这些写法**都能用**，不需要手改 `chat-path`：

| `base-url` | `chat-path` | 实际请求 URL |
|-----------|-------------|-------------|
| `https://api.deepseek.com` | 不填 | `https://api.deepseek.com/v1/chat/completions` |
| `https://aigw-gzgy2.cucloud.cn:8443/v1` | 不填 | `https://aigw-gzgy2.cucloud.cn:8443/v1/chat/completions` |
| `https://aigw-gzgy2.cucloud.cn:8443/v1/` | 不填 | 同上（结尾斜杠忽略） |
| `https://dashscope.aliyuncs.com/compatible-mode/v1` | 不填 | `.../compatible-mode/v1/chat/completions` |
| `https://ark.cn-beijing.volces.com/api/v3` | 不填 | `.../api/v3/chat/completions` |
| `https://open.bigmodel.cn/api/paas/v4` | 不填或 `/chat/completions` | `.../api/paas/v4/chat/completions` |
| `https://host/v1/chat/completions` | 不填 | 原样使用（已经是完整 endpoint） |
| `https://host/v1` | `chat/completions` | `https://host/v1/chat/completions`（相对路径也认） |
| 任意 | `https://other/v2/chat/completions` | 完整 URL 优先，base-url 被忽略 |

归一化规则（`ChatEndpoint`）：

1. `chat-path` 是完整 http(s) URL → 直接用；
2. 不填 `chat-path` → 默认 `/v1/chat/completions`；
3. `chat-path` 不以 `/` 开头 → 补 `/`；
4. `base-url` 已经以 `chat-path` 结尾 → 直接用 `base-url`；
5. `base-url` 最后一段是 API 版本段（`v1` / `v3` / `v4` / `v1beta`…）且 `chat-path` 第一段也是
   版本段 → 去掉 `chat-path` 那一段再拼（`/v1` + `/v1/chat/completions` → `/v1/chat/completions`）；
6. `base-url` 上的 query（Azure 风格 `?api-version=...`）保留，`chat-path` 自带 query 时以 `chat-path` 为准。

> 若厂家给的**不是** OpenAI 兼容的 `/chat/completions` 路径，用完整 URL 形式填 `chat-path` 最省事。

---

## 3. 模型 id 不匹配：`aliases`

厂家模型 id 和应用里已发出的 id 经常对不上，例如：

- 应用默认/前端历史偏好发的是 `deepseek-chat`，但厂家只有 `deepseek-v3`；
- 厂家给的是 `deepseek-ai/DeepSeek-V3`（带 `/`，不会被当作 `provider/model` 拆开）；
- Nacos 里的 `default-model` 还是上一家厂商的 id。

不想改前端、不想清用户本地 `kn_chat_model` 缓存时，用 `aliases` 把「应用侧 id」映射到
「厂家 id」。请求进来先归一成 `name` 再发出去：

```yaml
models:
  - name: deepseek-v3          # 真正发给厂家的 id
    aliases:
      - deepseek-chat          # 应用侧常用默认 id
      - deepseek-v4-flash      # 上一版 Nacos default-model
```

补充行为：

- 请求的 id 没被任何 provider 声明（且不是 `provider/model` 形式）→ 回退默认 provider，
  并打 WARN 列出已声明的模型；如果该 provider **只声明了一个模型**，客户端会直接用它并在日志说明
  （避免把厂家不认识的 id 发出去换回 404 `model_not_found`）。
- `provider/model` 形式仍可用于多 provider 场景（如 `official/deepseek-chat`），且只有前缀确实是
  已配置 provider 时才按前缀解析，带 `/` 的厂家模型 id 不会误伤。
- 启动时如果 `agent.default-model` 没被 `default-provider` 声明，会打 WARN 并提示 404 `model_not_found`。

---

## 4. 单模型其它可选项

```yaml
models:
  - name: deepseek-v3
    aliases: [deepseek-chat]
    vision: false              # true = 该模型能读图；不配则按名称启发式（*-vl/gpt-4o/…）判断
    extra:                     # 原样并入请求体，厂家扩展参数用
      stream_options:
        include_usage: true
```

## 5. 厂家要求非 Bearer 鉴权头

`api-key` 固定生成 `Authorization: Bearer <key>`。若厂家要求 `api-key` / `X-App-Id` 等头，用
`headers` 追加（同名字段覆盖自动生成的头）：

```yaml
providers:
  vendor:
    base-url: https://vendor.example/v1
    headers:
      api-key: ${VENDOR_API_KEY:}
      X-App-Id: knowledge-agent
    models:
      - name: deepseek-v3
```

---

## 6. 本例：联通云 AI 网关（`https://aigw-gzgy2.cucloud.cn:8443/v1`）

Nacos 上把 `knowledge-agent-skills` 的 provider 配成（模型 id 以厂家文档为准）：

```yaml
agent:
  default-provider: deepseek
  default-model: deepseek-v3
  providers:
    deepseek:
      base-url: https://aigw-gzgy2.cucloud.cn:8443/v1
      api-key: ${DEEPSEEK_API_KEY:}
      models:
        - name: deepseek-v3
          aliases:
            - deepseek-chat
            - deepseek-v4-flash
```

启动日志应出现（URL 里只有一个 `/v1`）：

```
LLM provider 'deepseek' ready: POST https://aigw-gzgy2.cucloud.cn:8443/v1/chat/completions (models: [deepseek-v3], api-key: set)
```

---

## 7. 404 排查清单

1. **先看启动日志** `LLM provider '<name>' ready: POST <url>`：
   - 出现 `/v1/v1/`、`/v3/v1/`、双斜杠或奇怪的拼接 → 版本没归一化（升级到带
     `ChatEndpoint` 的版本后应自动消失；仍出现就是 `base-url` 里有多余段）。
   - URL 是 `https://host/...` 但厂家要求的是内网/其他域名 → `base-url` 写错。
2. **404 响应体里带 `model_not_found` / `The model ... does not exist`** → 模型 id 问题，
   用 `models[].name` + `aliases` 对齐（第 3 节），或改 `default-model`。
3. **响应体为空 / `404 page not found`** → 路径问题；大部分 OpenAI 兼容网关是
   `/v1/chat/completions`，不是就按第 2 节用完整 URL。
4. **手工复现**（把 key、模型 id 换成实际值）：

   ```bash
   curl -i -X POST 'https://aigw-gzgy2.cucloud.cn:8443/v1/chat/completions' \
     -H 'Content-Type: application/json' \
     -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
     -d '{"model":"deepseek-v3","messages":[{"role":"user","content":"hi"}],"max_tokens":1}'
   ```

   - `401/403`：鉴权问题（key 或 `headers`）；
   - `404 model_not_found`：模型 id 问题；
   - `404` 且为空：路径问题；
   - `200`：后端日志里的 URL/模型和这条 curl 对齐即可。
5. 后端日志现在会把 **provider + HTTP 状态 + 真实 URL + 响应体** 一起打出来
   （`LLM chat API error for provider ... POST ...`），直接按上面的分类看。

---

## 8. 多 provider（同一份应用里混用厂家）

```yaml
agent:
  default-provider: deepseek
  providers:
    deepseek:            # 第三方 DeepSeek
      base-url: https://aigw-gzgy2.cucloud.cn:8443/v1
      api-key: ${DEEPSEEK_API_KEY:}
      models:
        - name: deepseek-v3
    official:            # DeepSeek 官方，给不希望走网关的场景
      base-url: https://api.deepseek.com
      api-key: ${DEEPSEEK_OFFICIAL_KEY:}
      models:
        - name: deepseek-chat
```

- `/api/v1/models` 会把所有 provider 的模型按 provider 分组返回，前端下拉可直接选；
- 同名模型以 `providers` 声明顺序**先声明者优先**；
- 需要强制指定 provider 时用 `provider/model`（`official/deepseek-chat`）。

---

## 9. 还没发新版本时的临时规避（旧版 `WebClient#baseUrl` 拼接）

旧版是 `baseUrl` + 相对路径直接拼接，**base-url 里带 `/v1` 就会重复**。如果后端暂时不能升级，
先在 Nacos 上把该 provider 的 `base-url` 去掉末尾的版本段，只留 scheme + host + port：

```yaml
agent:
  default-provider: deepseek
  default-model: deepseek-v3        # 必须换成厂家文档里的真实模型 id，否则 404 model_not_found
  providers:
    deepseek:
      base-url: https://aigw-gzgy2.cucloud.cn:8443   # 旧版：不要带 /v1
      api-key: ${DEEPSEEK_API_KEY:}
      models:
        - name: deepseek-v3
```

旧版拼出的 URL 会是 `https://aigw-gzgy2.cucloud.cn:8443/v1/chat/completions`（正确）。
升级到带 `ChatEndpoint` 的版本后，`base-url` 带不带 `/v1` 都可以，两种写法都能正确归一化。