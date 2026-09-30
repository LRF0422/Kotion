/**
 * Plugin Studio — the kernel-facing artifact contribution, assembled.
 *
 * Tool names come from `surface.ts` (React-free) so the pairs "this tool maps a
 * result to an artifact" and "this tool has a conversation card" can be checked
 * without importing this React tree. The mapper itself is attached to each tool
 * definition in `index.tsx`, which is what lets the kernel key it by wire name.
 */
import type { AgentArtifactRendererContribution, AgentToolRendererContribution } from '@kn/common'
import { PluginBuildCard, PluginIconCard, PluginProjectCard } from './cards'
import { PluginIconPane } from './IconPane'
import { PluginArtifactPane } from './pane'
import {
    BUILD_ARTIFACT_TOOLS,
    ICON_ARTIFACT_TOOLS,
    PLUGIN_BUILD_KIND,
    PLUGIN_ICON_KIND,
    PLUGIN_PROJECT_KIND,
    PROJECT_ARTIFACT_TOOLS,
} from './surface'

/** One card per producing tool; reads keep the generic JSON rendering. */
export const STUDIO_TOOL_RENDERERS: AgentToolRendererContribution[] = [
    ...BUILD_ARTIFACT_TOOLS.map((tool) => ({ tool, render: PluginBuildCard })),
    ...PROJECT_ARTIFACT_TOOLS.map((tool) => ({ tool, render: PluginProjectCard })),
    ...ICON_ARTIFACT_TOOLS.map((tool) => ({ tool, render: PluginIconCard })),
]

/** Side-pane previews for the studio's artifact kinds. */
export const STUDIO_ARTIFACT_RENDERERS: AgentArtifactRendererContribution[] = [
    { kind: PLUGIN_BUILD_KIND, render: PluginArtifactPane },
    { kind: PLUGIN_PROJECT_KIND, render: PluginArtifactPane },
    { kind: PLUGIN_ICON_KIND, render: PluginIconPane },
]
