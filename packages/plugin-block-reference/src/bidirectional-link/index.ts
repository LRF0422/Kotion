/** Bidirectional page and block linking surfaces. */
import './styles/bidirectional-link.css';

export { PageLink, PAGE_LINK_CLICK } from './extensions/PageLink';
export type { PageLinkAttributes } from './extensions/PageLink';
export { PageLinkNode } from './extensions/PageLinkNode';
export type { PageLinkNodeAttributes } from './extensions/PageLinkNode';
export { BlockLink } from './extensions/BlockLink';
export type { BlockLinkAttributes } from './extensions/BlockLink';
export { LinkTrigger } from './extensions/LinkTrigger';

export { PageLinkPicker } from './components/PageLinkPicker';
export { BlockLinkPicker } from './components/BlockLinkPicker';
export { BacklinksPanel } from './components/BacklinksPanel';
export { PageFooter } from './components/PageFooter';

export { useLinkTriggers } from './hooks/useLinkTriggers';

export {
    getLocalPageBacklinks,
    buildSpaceBacklinkIndex,
    getUnlinkedMentions,
    invalidateBacklinkIndex,
} from './services/localBacklinkIndex';

export type { BlockSummary, PageRelation, PageSummary } from '@kn/common';
