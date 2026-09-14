# 远程技能（Remote Skill）运维与契约

远程技能 = 其它微服务用 Agent SDK 的 `@AgentSkill` / `@SkillTool` 注解声明、
并注册给 **knowledge-agent** 服务的工具。agent 侧消费端位于
`com.knowledge.agent.core.skill.*`，注册 SDK（`knowledge-tool/knowledge-core-agent`）
的 HTTP 契约保持不变。

当前注册方：`knowledge-wiki`（wiki-page）、`knowledge-file-center`
（file-operation / web-download / web-resource）。

---

## 1. 链路

```
微服务启动
  @AgentSkill 扫描 (AgentSkillRegistrar)
    └─ Feign POST knowledge-agent /api/v1/skills/register-remote   (SkillDefinition[])
         └─ RemoteSkillController → RemoteSkillRegistry
              ├─ Redis  agentcore:skill:{serviceId}:{toolName}
              └─ 内存  ToolGateway.backendSpecs() → 加入 LLM tools
 每 30s  POST /api/v1/skills/heartbeat        (HeartbeatRequest{serviceId, skillIds})
 每 300s POST /api/v1/skills/register-remote  (周期性重注册，兜底)
 关闭时  POST /api/v1/skills/unregister-remote
```

调用时 `RemoteSkillTool` → `RemoteSkillInvoker` POST 到该服务的
`/api/v1/agent-sdk/invoke`，并透传用户 JWT（`knowledge-auth` 头）。

> ⚠️ `SecurityContextUtil.getToken()` 返回的是**去掉 `Bearer ` 前缀的裸 JWT**，而目标
> 服务的 `JwtAuthenticationFilter` 只认 `Bearer ` 前缀（裸 token 会被当作未认证而 403）。
> `RemoteSkillInvoker` 统一补齐 `Bearer ` 前缀后再转发——这是后端主动调用远程技能时
> 最常见的 403 原因。

---

## 2. 存活语义（务必理解）

- 心跳携带的是 **skillId**（如 `wiki-page`），一个 skill 可对应多个 tool
  （`summarize_page` / `search_content` …）。注册表以 `serviceId:toolName` 为
  key，因此心跳必须按 `skillId`（或兼容地按 `toolName`）匹配，刷新该 skill
  的全部 tool。
- 超过 `agent.remote-skill.stale-ms`（默认 90s）没有心跳的 tool 会从 LLM
  工具列表中摘除，但记录仍留在 registry/Redis 中，可通过诊断接口查看。
- agent 重启时，从 Redis 恢复的注册会按“刚心跳过”处理（给予一个 stale 窗口
  的宽限），避免重启瞬间把技能全部摘掉；之后靠注册方的心跳续命。
- 周期性重注册覆盖“agent 后于微服务启动 / 首次注册失败”的场景；注册是幂等的。

> 历史 bug（已修）：心跳发 skillId、注册表用 toolName 查找，导致注册后
> 约 90s 所有远程技能从工具列表消失；叠加“心跳不落 Redis + 重启用陈旧时间戳”，
> agent 重启后技能永久不可见。

---

## 3. 配置

agent 服务 `application.yml`：

```yaml
agent:
  remote-skill:
    enabled: true            # false = 完全不注册/不暴露
    stale-ms: 90000          # 无心跳判定为死亡的窗口
    call-timeout-seconds: 30 # 单次远程调用超时
```

注册方 SDK（可选，默认即可）：

```yaml
agent:
  sdk:
    enabled: true
    heartbeat-interval: 30      # 心跳间隔（秒）
    reregister-interval: 300    # 周期重注册（秒），<=0 关闭
    registration-retry-max: 5
    # callback-base-url: http://my-service:8100   # 显式回调地址（可选）
```

安全：注册/心跳/注销是服务间调用，不带用户 JWT，因此在 agent 服务放行
（`/api/v1/skills/**`）。**skill 的 invoke 回调相反**：它转发用户 JWT，仍然
受保护。若 Nacos 上的共享配置覆盖了 `knowledge.secure.skip-url`，需一并包含
`/api/v1/skills/**`。

---

## 4. 诊断

- **查看已注册技能（含 stale）**：
  `GET http://<agent>:7780/api/v1/skills/remote`
  返回每项的 `serviceId / skillId / toolName / status / lastHeartbeat /
  heartbeatAgeMs / live / callbackUrl`。`live=false` 表示已过心跳窗口、不会
  提供给模型。
- **Redis**：`redis-cli --scan --pattern 'agentcore:skill:*'`，逐个 GET 检查
  `lastHeartbeat`；`agentcore:skill:services` 是服务索引。
- **日志**：`[AgentSDK]`（注册方）、`Registered N remote skill tool(s)` /
  `Restored N remote skill tool(s)` / `Remote skill heartbeat ... matched no
  registered tools`（agent 侧）。

## 5. 排障顺序

1. 调 `GET /api/v1/skills/remote`：没有记录 → 注册没到达（查 401/服务名/
   Nacos 发现）；有记录但 `live=false` → 心跳没刷新（查注册方 `[AgentSDK]
   Heartbeat` 与 skillId）。
2. 注册返回 401/403 → 放行 `/api/v1/skills/**`（见上）。
3. 工具可见但调用失败（尤其 **403**）→ 后端主动调用时 JWT 必须带 `Bearer ` 前缀
   （见上）；再查 `RemoteSkillInvoker` 日志里的 callback 失败信息：会先试 SDK 上报的
   callbackUrl，失败后退化为按 `serviceId` 走 Nacos 发现解析实例再试。
4. 改完配置/代码后需重启对应微服务与 agent 服务。
