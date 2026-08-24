package com.knowledge.wiki.service.doc;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.knowledge.wiki.service.cache.BlockCacheService;
import com.knowledge.wiki.service.entity.event.PageDocChangedEvent;
import com.knowledge.wiki.service.search.WikiSearchService;

@ExtendWith(MockitoExtension.class)
class PageDocProjectionListenerTest {

    @Mock
    private BlockCacheService blockCacheService;
    @Mock
    private WikiSearchService wikiSearchService;
    @Mock
    private WikiLinkProjectionService wikiLinkProjectionService;
    @Mock
    private PageDocService pageDocService;

    @InjectMocks
    private PageDocProjectionListener listener;

    @Test
    void projectionFailuresAreIsolatedFromOtherRebuilds() {
        doThrow(new IllegalStateException("redis unavailable"))
                .when(wikiSearchService).reindexPage(9L);
        when(pageDocService.readRev(9L)).thenReturn(4L);

        listener.onPageDocChanged(new PageDocChangedEvent(9L, 4L));

        verify(blockCacheService, times(3)).evictPageCache(9L);
        verify(blockCacheService, times(3)).evictAssembledTree(9L);
        verify(wikiSearchService, times(3)).reindexPage(9L);
        verify(wikiLinkProjectionService, times(3)).syncPage(9L);
    }
}
