/**
 * plugin-main's agent surface, as data.
 *
 * Kept out of `index.tsx` — which pulls the entire React route tree — so the
 * declaration can be checked without rendering anything:
 * `check:knowledge-base-skill` asserts this list and the names the knowledge-base
 * skill claims are the SAME set.
 *
 * That equality is load-bearing, not cosmetic. A page tool the skill names but
 * this list omits is prose about a function that cannot be called; a tool listed
 * here but unmentioned by the skill is a capability the model never learns about.
 * The case that motivated the split: `editPage` — the tool that switches the
 * conversation's / workbench's off-screen edit target — was implemented in core
 * and present in the built-in metadata registry, but absent from both this list
 * and the skill, so the workspace filter dropped it and "编辑这个已有页面" ended
 * in TOOL_NOT_FOUND.
 */
export const PAGE_AGENT_INCLUDE = [
    'searchPages',
    'searchContent',
    'createPage',
    // Retargets the off-screen edit target. Editor-free (core registers an
    // `any`-scoped implementation), which is what lets a workbench run with no
    // document acquire an existing page's editor instead of navigating away.
    'editPage',
    'listSpaces',
    'getSpacePageTree',
    'openPage',
    'openPageSide',
    'focusArtifact',
] as const
