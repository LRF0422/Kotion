/**
 * Agent Harness — public surface
 *
 * The unified, UI-agnostic agent runtime core. Adapters build a capability
 * catalog and consume the typed event stream from {@link AgentHarnessImpl.run}.
 */

export { AgentHarnessImpl } from './agent-harness'
export { V2AgentRuntime } from './v2-agent-runtime'
export type { ContinueSessionInput } from './v2-agent-runtime'
export type { AgentHarness, HarnessEvent, HarnessRunInput, ExecutionStep } from './types'
export { parseToolArgs } from './tool-loop'
