/**
 * 查询会话的运行时（连接树与查询标签共用）。
 *
 * 把「一份 ConnectionConfig + 一段文本」变成真实结果，收口三件事：
 *
 * 1. 通道选择：mock 走 connector 的内置演示数据（不出网），http / native 走 Transport；
 * 2. 网络策略：发请求前先读宿主的 SSRF 策略，内网目标未放行时直接给出可读提示，
 *    而不是等主进程抛 IPC 错误再翻译（体验差一步，但省一次往返）；
 * 3. 超时：Advanced 里的 connectionTimeoutMs / queryTimeoutMs 是真实生效的，
 *    其余长连接参数在 HTTP 通道下仅作元数据保存（见 types.ts 的注释）。
 *
 * 这一层没有 React，也不碰 localStorage——UI 只调用这里的函数。
 */
import { tt } from '../i18n'
import type {
    ConnectionConfig,
    Connector,
    PingResult,
    QueryResult,
    SchemaMeta,
    TransportRequest,
} from './types'
import { connectorRegistry } from './registry'
import { createTransport } from './transport'
import { canReachTarget, describeTransportError, readHostNetPolicy } from './netPolicy'

/** 默认超时：Ping / 拉表共用（查询用 Advanced 里的 queryTimeoutMs）。 */
const DEFAULT_IO_TIMEOUT = 15_000

/** 演示通道的人造延迟，让「测试连接」有可感知的反馈。 */
const MOCK_PING_DELAY = 150
const MOCK_QUERY_DELAY = 180

export type Channel = 'mock' | 'http' | 'native'

/** 通道；缺省视为 mock（与向导默认值一致，避免旧连接意外发起网络请求）。 */
export function channelOf(config: ConnectionConfig): Channel {
    return config.transport ?? 'mock'
}

function errText(e: unknown): string {
    return e instanceof Error ? e.message : String(e ?? '')
}

/** 取 Connector；未实现的类型直接抛错（UI 层会把它显示成一条错误提示）。 */
function requireConnector(kind: ConnectionConfig['kind']): Connector {
    const connector = connectorRegistry.get(kind)
    if (!connector) throw new Error(tt('connectFailed'))
    return connector
}

/** 规范化配置（adapter 负责补默认值 / 校验端口等）。 */
export function normalizeConfig(raw: ConnectionConfig): ConnectionConfig {
    return requireConnector(raw.kind).normalizeConfig(raw)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

class TimeoutError extends Error {}

/** 竞速超时：到点即以 TimeoutError 结束，避免 UI 永远转圈。 */
function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError('timeout')), Math.max(1, ms))
    })
    return Promise.race([task, timeout]).finally(() => {
        if (timer) clearTimeout(timer)
    }) as Promise<T>
}

/** HTTP / native 通道的前置检查：网关地址 + 宿主网络策略。 */
async function prepareHttp(config: ConnectionConfig): Promise<string | null> {
    if (!config.gatewayUrl?.trim()) return tt('wizardNeedGateway')
    const policy = await readHostNetPolicy()
    if (!canReachTarget(config.gatewayUrl, policy)) return tt('transportPrivateBlocked')
    return null
}

function transportFor(config: ConnectionConfig) {
    return createTransport(channelOf(config) === 'native' ? 'native' : 'http')
}

/** 把一条提示包装成结果，让结果区统一渲染（不用另开一套错误 UI）。 */
export function statusResult(message: string): QueryResult {
    return { kind: 'status', columns: [], rows: [], meta: { message } }
}

/** 测试连接。永远 resolve（失败放进 PingResult.error），方便向导直接展示。 */
export async function testConnection(raw: ConnectionConfig): Promise<PingResult> {
    let config: ConnectionConfig
    try {
        config = normalizeConfig(raw)
    } catch (e) {
        return { ok: false, error: errText(e) }
    }

    if (channelOf(config) === 'mock') {
        await sleep(MOCK_PING_DELAY)
        return { ok: true, latencyMs: MOCK_PING_DELAY, serverVersion: 'mock' }
    }

    const blocked = await prepareHttp(config)
    if (blocked) return { ok: false, error: blocked }

    const started = Date.now()
    try {
        const connector = requireConnector(config.kind)
        const response = await withTimeout(
            transportFor(config).request(connector.buildPing(config)),
            config.advanced?.connectionTimeoutMs ?? DEFAULT_IO_TIMEOUT,
        )
        const ping = connector.parsePing(config, response)
        return { ...ping, latencyMs: Date.now() - started }
    } catch (e) {
        return {
            ok: false,
            latencyMs: Date.now() - started,
            error: e instanceof TimeoutError ? tt('connectFailed') : describeTransportError(e),
        }
    }
}

export interface SchemaLoad {
    schema: SchemaMeta | null
    error?: string
}

/** 读取库结构（连接树展开时调用）。失败时 schema 为 null，error 可直接展示。 */
export async function loadSchema(raw: ConnectionConfig): Promise<SchemaLoad> {
    let config: ConnectionConfig
    try {
        config = normalizeConfig(raw)
    } catch (e) {
        return { schema: null, error: errText(e) }
    }

    const connector = requireConnector(config.kind)
    if (channelOf(config) === 'mock') return { schema: connector.demoListTables(config) }

    const blocked = await prepareHttp(config)
    if (blocked) return { schema: null, error: blocked }

    try {
        const response = await withTimeout(
            transportFor(config).request(connector.buildListTables(config)),
            config.advanced?.connectionTimeoutMs ?? DEFAULT_IO_TIMEOUT,
        )
        if (response.error && response.status === 0) {
            return { schema: null, error: response.error }
        }
        return { schema: connector.parseSchema(config, response) }
    } catch (e) {
        return { schema: null, error: describeTransportError(e) }
    }
}

/** 执行查询。错误一律折叠成 kind='status' 的结果，UI 只管展示。 */
export async function runQuery(raw: ConnectionConfig, text: string): Promise<QueryResult> {
    const started = Date.now()
    const trimmed = text.trim()
    if (!trimmed) return statusResult(tt('connectFailed'))

    let config: ConnectionConfig
    try {
        config = normalizeConfig(raw)
    } catch (e) {
        return statusResult(errText(e))
    }

    const connector = requireConnector(config.kind)

    if (channelOf(config) === 'mock') {
        await sleep(MOCK_QUERY_DELAY)
        const demo = connector.demoQuery(config, { text: trimmed })
        return { ...demo, meta: { ...(demo.meta ?? {}), elapsedMs: Date.now() - started } }
    }

    const blocked = await prepareHttp(config)
    if (blocked) return statusResult(blocked)

    const timeoutMs = config.advanced?.queryTimeoutMs ?? 30_000
    let request: TransportRequest
    try {
        request = connector.buildQuery(config, { text: trimmed })
    } catch (e) {
        return statusResult(errText(e))
    }

    try {
        const response = await withTimeout(transportFor(config).request(request), timeoutMs)
        const result = connector.parseResult(config, request, response)
        return {
            ...result,
            meta: { ...(result.meta ?? {}), elapsedMs: Date.now() - started },
        }
    } catch (e) {
        if (e instanceof TimeoutError) return statusResult(tt('queryTimeoutMsg', { ms: timeoutMs }))
        return statusResult(describeTransportError(e))
    }
}

/**
 * 写语句识别：用于 Read Only 拦截与 PROD 二次确认。
 *
 * 刻意保持「宽松」：宁可多拦一次让用户手动确认，也不要在 PROD 上漏掉一条 DELETE。
 * 先剥掉开头的注释，避免 `-- 只读\nDROP TABLE t` 这种绕过。
 */
const WRITE_PREFIX =
    /^\s*(insert|update|delete|replace|merge|upsert|drop|alter|truncate|create|rename|grant|revoke|call|load|copy|set|del|flushdb|flushall)\b/i

const LEADING_COMMENTS = /^(?:\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|#[^\n]*\n))*/

export function isWriteStatement(text: string): boolean {
    return WRITE_PREFIX.test(text.replace(LEADING_COMMENTS, ''))
}
