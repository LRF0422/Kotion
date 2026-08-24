package com.knowledge.wiki.service.doc;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import com.knowledge.wiki.service.mapper.BlockBackfillMapper;

import lombok.extern.slf4j.Slf4j;

/**
 * Refuses to serve PageDoc-only reads while live pages still lack an authoritative
 * head. This turns the required backfill ordering into a startup invariant rather
 * than an operator convention that can expose legacy pages as blank documents.
 */
@Component
@Order(100)
@Slf4j
@ConditionalOnProperty(value = "knowledge.wiki.page-doc-readiness.enabled", havingValue = "true", matchIfMissing = true)
public class PageDocReadinessRunner implements ApplicationRunner {

    @Autowired
    private BlockBackfillMapper blockBackfillMapper;

    @Override
    public void run(ApplicationArguments args) {
        long missing = blockBackfillMapper.countPagesWithoutHead();
        if (missing > 0) {
            throw new IllegalStateException("PageDoc cutover blocked: " + missing
                    + " live page(s) have no wiki_page_head. Run the non-dry-run block backfill before serving traffic.");
        }
        log.info("PageDoc readiness verified: every live page has an authoritative head");
    }
}
