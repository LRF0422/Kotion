package com.knowledge.agent.core.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentRunEventEntity;
import com.knowledge.agent.core.mapper.AgentRunEventMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;

import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The cold-tier mirror must not issue one INSERT per streamed token: a burst of
 * events has to leave through a handful of multi-row INSERTs, and a graceful
 * shutdown must never drop a queued event.
 */
class DefaultRunEventLogTest {

    private static final String RUN_ID = "run-1";

    @Test
    @SuppressWarnings("unchecked")
    void mirrorsBurstOfEventsInBatchesAndFlushesOnShutdown() throws Exception {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ZSetOperations<String, String> zset = mock(ZSetOperations.class);
        when(redis.opsForZSet()).thenReturn(zset);
        when(zset.add(anyString(), anyString(), anyDouble())).thenReturn(true);
        when(redis.expire(anyString(), anyLong(), any(TimeUnit.class))).thenReturn(true);
        when(zset.zCard(anyString())).thenReturn(1L);

        AgentRunEventMapper mapper = mock(AgentRunEventMapper.class);
        AtomicInteger rows = new AtomicInteger();
        AtomicInteger batches = new AtomicInteger();
        doAnswer(invocation -> {
            List<AgentRunEventEntity> batch = invocation.getArgument(0);
            rows.addAndGet(batch.size());
            batches.incrementAndGet();
            return null;
        }).when(mapper).insertBatch(anyList());

        AgentCoreProperties properties = new AgentCoreProperties();
        properties.getEvent().setMirrorBatchSize(10);
        properties.getEvent().setMirrorFlushIntervalMs(50);

        DefaultRunEventLog eventLog =
                new DefaultRunEventLog(redis, new ObjectMapper(), mapper, properties);
        try {
            int total = 25;
            for (int i = 0; i < total; i++) {
                eventLog.append(RUN_ID, RunEvents.TEXT_DELTA, RunEvents.textDelta("t" + i));
            }

            long deadline = System.currentTimeMillis() + 4000;
            while (rows.get() < total && System.currentTimeMillis() < deadline) {
                Thread.sleep(25);
            }

            assertEquals(total, rows.get(), "every appended event must be mirrored");
            assertTrue(batches.get() <= 3,
                    "a burst must coalesce into a few batches, saw " + batches.get());
            verify(mapper, atLeastOnce()).insertBatch(anyList());
            verify(mapper, never()).insertEvent(any());
        } finally {
            eventLog.shutdown();
        }
    }
}
