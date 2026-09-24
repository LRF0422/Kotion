/**
 * Leaf contract shared by the agent wire types and the image helpers.
 *
 * Deliberately dependency-free: the agent core's isolated `tsc` check scripts
 * compile this file (through `agent/types.ts` and `agent/tool-executor.ts`)
 * with `--module commonjs`, and reaching the full `image-attachments.ts` —
 * which imports the Vite/`import.meta` auth chain via `utils/session` — made
 * that compile fail on files outside the check's rootDir.
 *
 * `image-attachments` re-exports both names, so the public `@kn/common`
 * surface is unchanged.
 */

/** Tool-result key that carries images from a frontend tool to the backend. */
export const AGENT_IMAGES_KEY = '__agentImages'

/**
 * OpenAI-compatible multimodal content part. Sent to the backend verbatim and
 * forwarded to the provider as the message's `content` array.
 */
export type AgentContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
