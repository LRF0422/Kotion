package com.knowledge.wiki.service.doc;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.knowledge.wiki.service.cache.BlockCacheService;
import com.knowledge.wiki.service.entity.event.PageDocChangedEvent;
import com.knowledge.wiki.service.search.WikiSearchService;

import lombok.extern.slf4j.Slf4j;

/** Runs rebuildable Redis/search/backlink projections only after PageDoc commit. */
@Component
@Slf4j
public class PageDocProjectionListener {

    private static final int LOCK_STRIPES = 256;
    private static final Object[] PAGE_LOCKS = new Object[LOCK_STRIPES];

    static {
        for (int i = 0; i < PAGE_LOCKS.length; i++) {
            PAGE_LOCKS[i] = new Object();
        }
    }

    @Autowired
    private BlockCacheService blockCacheService;

    @Autowired
    private WikiSearchService wikiSearchService;

    @Autowired
    private WikiLinkProjectionService wikiLinkProjectionService;

    @Autowired
    private PageDocService pageDocService;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onPageDocChanged(PageDocChangedEvent event) {
        Long pageId = event.getPageId();
        if (pageId == null) {
            return;
        }
        // Async events for the same page can be scheduled out of order. Serialise
        // their complete rebuilds by page stripe: each projection reads current DB
        // state, so whichever event runs last still publishes the newest state.
        Object lock = PAGE_LOCKS[(pageId.hashCode() & Integer.MAX_VALUE) % LOCK_STRIPES];
        synchronized (lock) {
            project(event, pageId);
        }
    }

    private void project(PageDocChangedEvent event, Long pageId) {
        long projectedRev = event.getRev() == null ? 0L : event.getRev();
        for (int attempt = 0; attempt < 3; attempt++) {
            boolean succeeded = projectCurrentState(event, pageId);
            long currentRev = pageDocService.readRev(pageId);
            if (succeeded && currentRev <= projectedRev) {
                return;
            }
            // Another instance committed while this projection was rebuilding.
            // Rebuild from current DB state again so an old async worker cannot be
            // the final writer of search/backlink projections.
            projectedRev = currentRev;
        }
        log.warn("PageDoc projection did not catch up after retries: pageId={} rev={}", pageId, projectedRev);
    }

    private boolean projectCurrentState(PageDocChangedEvent event, Long pageId) {
        boolean succeeded = true;
        try {
            // These legacy keys may still have been populated by compatibility
            // endpoints. New readers bypass them, but eviction prevents stale data
            // from surviving for any old caller during the transition.
            blockCacheService.evictPageCache(pageId);
            blockCacheService.evictAssembledTree(pageId);
        } catch (Exception e) {
            succeeded = false;
            log.warn("PageDoc cache projection failed: pageId={}, rev={}", pageId, event.getRev(), e);
        }

        try {
            wikiSearchService.reindexPage(pageId);
        } catch (Exception e) {
            succeeded = false;
            log.warn("PageDoc search projection failed: pageId={}, rev={}", pageId, event.getRev(), e);
        }

        try {
            wikiLinkProjectionService.syncPage(pageId);
        } catch (Exception e) {
            succeeded = false;
            log.warn("PageDoc backlink projection failed: pageId={}, rev={}", pageId, event.getRev(), e);
        }
        return succeeded;
    }
}
