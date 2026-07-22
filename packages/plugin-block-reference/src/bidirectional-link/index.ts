/**
 * Bidirectional Link Module
 * 
 * Provides bidirectional linking functionality for the Knowledge editor:
 * - [[Page Title]] syntax for page links
 * - ((block-id)) syntax for block links
 * - Backlinks panel to show references
 * 
 * @module @kn/plugin-block-reference/bidirectional-link
 */

// Styles (pill link, suggestion highlight, snippet highlight)
import './styles/bidirectional-link.css';

// API definitions
export { APIS } from './api';

// Extensions
export { PageLink, PAGE_LINK_CLICK } from './extensions/PageLink';
export type { PageLinkAttributes } from './extensions/PageLink';
export { PageLinkNode } from './extensions/PageLinkNode';
export type { PageLinkNodeAttributes } from './extensions/PageLinkNode';
export { BlockLink } from './extensions/BlockLink';
export type { BlockLinkAttributes } from './extensions/BlockLink';
export { LinkTrigger } from './extensions/LinkTrigger';

// Components
export { PageLinkPicker } from './components/PageLinkPicker';
export { BlockLinkPicker } from './components/BlockLinkPicker';
export { BacklinksPanel } from './components/BacklinksPanel';
export { PageFooter } from './components/PageFooter';

// Hooks
export { useLinkTriggers } from './hooks/useLinkTriggers';

// Services
export {
    getPageBacklinks,
    getBlockBacklinks,
    searchPages,
    searchBlocks,
} from './services/linkService';
export {
    getLocalPageBacklinks,
    buildSpaceBacklinkIndex,
    getUnlinkedMentions,
    invalidateBacklinkIndex,
} from './services/localBacklinkIndex';
export type {
    BacklinkVO,
    PageTreeNode,
    BlockInfo,
} from './services/linkService';
