package com.knowledge.agent.core.memory;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.entity.AgentThreadEntity;
import com.knowledge.agent.core.llm.LlmGateway;
import com.knowledge.agent.core.llm.LlmInferRequest;
import com.knowledge.agent.core.llm.LlmResult;
import com.knowledge.agent.core.supervisor.ThreadStore;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ThreadSummarizerTest {

    @Test
    void firstSummaryIsPlainAndPersistsOnTheThread() throws InterruptedException {
        Fixture fixture = new Fixture();
        fixture.gatewayAnswer("整理了一份会议纪要");

        fixture.summarizer.summarizeAsync("run-1", "conv-1", "deepseek-chat");

        await(() -> verify(fixture.threadStore)
                .updateMeta(eq("conv-1"), isNull(), eq("整理了一份会议纪要")));
        LlmInferRequest request = fixture.capturedRequest();
        assertTrue(request.getMessages().get(0).getContent().contains("1-2 句话"));
        assertFalse(request.getMessages().get(1).getContent().contains("已有摘要"));
    }

    @Test
    void rollingSummaryMergesPreviousSummaryWithTheRunTail() throws InterruptedException {
        Fixture fixture = new Fixture();
        AgentThreadEntity thread = new AgentThreadEntity();
        thread.setSummary("上次：已完成周报模板初稿");
        when(fixture.threadStore.get("conv-1")).thenReturn(thread);
        fixture.gatewayAnswer("周报模板初稿已完成并发布");

        fixture.summarizer.summarizeAsync("run-1", "conv-1", "deepseek-chat");

        await(() -> verify(fixture.threadStore)
                .updateMeta(eq("conv-1"), isNull(), eq("周报模板初稿已完成并发布")));
        LlmInferRequest request = fixture.capturedRequest();
        assertTrue(request.getMessages().get(0).getContent().contains("持续维护"));
        String user = request.getMessages().get(1).getContent();
        assertTrue(user.contains("【已有摘要】"));
        assertTrue(user.contains("上次：已完成周报模板初稿"));
        assertTrue(user.contains("【最近一段对话】"));
        assertTrue(user.contains("整理周报"));
    }

    /** Poll the async single-thread executor until the assertion passes. */
    private static void await(ThrowingRunnable assertion) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (true) {
            try {
                assertion.run();
                return;
            } catch (AssertionError error) {
                if (System.currentTimeMillis() > deadline) {
                    throw error;
                }
                Thread.sleep(50);
            }
        }
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run();
    }

    private static final class Fixture {
        private final ThreadStore threadStore = mock(ThreadStore.class);
        private final CheckpointStore checkpointStore = mock(CheckpointStore.class);
        private final LlmGateway gateway = mock(LlmGateway.class);
        private final ThreadSummarizer summarizer =
                new ThreadSummarizer(threadStore, checkpointStore, gateway);

        private Fixture() {
            Checkpoint checkpoint = new Checkpoint();
            checkpoint.getMessages().add(ChatMessage.builder()
                    .role("user").content("整理周报").build());
            checkpoint.getMessages().add(ChatMessage.builder()
                    .role("assistant").content("好的，开始整理周报").build());
            when(checkpointStore.load("run-1")).thenReturn(checkpoint);
        }

        private void gatewayAnswer(String text) {
            LlmResult result = new LlmResult();
            result.setText(text);
            when(gateway.infer(any(LlmInferRequest.class))).thenReturn(result);
        }

        private LlmInferRequest capturedRequest() {
            ArgumentCaptor<LlmInferRequest> captor = ArgumentCaptor.forClass(LlmInferRequest.class);
            verify(gateway).infer(captor.capture());
            return captor.getValue();
        }
    }
}
