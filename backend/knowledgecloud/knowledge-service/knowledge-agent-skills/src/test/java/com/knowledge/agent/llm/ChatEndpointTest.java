package com.knowledge.agent.llm;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatEndpointTest {

    @Test
    void originOnlyBaseUsesDefaultOpenAiPath() {
        assertEquals("https://api.deepseek.com/v1/chat/completions",
                ChatEndpoint.resolve("https://api.deepseek.com", null));
    }

    @Test
    void baseUrlWithVersionSegmentIsNotDoubled() {
        // The 404 this change fixes: the vendor hands out "<host>/v1" as the base
        // URL, the default chat path is "/v1/chat/completions", and plain
        // concatenation produced "/v1/v1/chat/completions".
        assertEquals("https://aigw-gzgy2.cucloud.cn:8443/v1/chat/completions",
                ChatEndpoint.resolve("https://aigw-gzgy2.cucloud.cn:8443/v1", null));
        assertEquals("https://aigw-gzgy2.cucloud.cn:8443/v1/chat/completions",
                ChatEndpoint.resolve("https://aigw-gzgy2.cucloud.cn:8443/v1", "/v1/chat/completions"));
        assertEquals("https://aigw-gzgy2.cucloud.cn:8443/v1/chat/completions",
                ChatEndpoint.resolve("https://aigw-gzgy2.cucloud.cn:8443/v1", "v1/chat/completions"));
    }

    @Test
    void trailingSlashOnBaseUrlIsIgnored() {
        assertEquals("https://host/v1/chat/completions",
                ChatEndpoint.resolve("https://host/v1/", null));
        assertEquals("https://host/v1/chat/completions",
                ChatEndpoint.resolve("https://host/v1///", null));
    }

    @Test
    void multiSegmentVersionBaseIsKeptAndNotDoubled() {
        assertEquals("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                ChatEndpoint.resolve("https://dashscope.aliyuncs.com/compatible-mode/v1", null));
        assertEquals("https://ark.cn-beijing.volces.com/api/v3/chat/completions",
                ChatEndpoint.resolve("https://ark.cn-beijing.volces.com/api/v3", null));
    }

    @Test
    void nonV1VersionBaseAppendsExplicitChatPath() {
        // Zhipu style: base URL ends with /api/paas/v4, chat path is /chat/completions.
        assertEquals("https://open.bigmodel.cn/api/paas/v4/chat/completions",
                ChatEndpoint.resolve("https://open.bigmodel.cn/api/paas/v4", "/chat/completions"));
        // The default path works too: a version-looking base segment counts as the
        // version already present, so "/v1" is not appended a second time.
        assertEquals("https://open.bigmodel.cn/api/paas/v4/chat/completions",
                ChatEndpoint.resolve("https://open.bigmodel.cn/api/paas/v4", null));
    }

    @Test
    void completeEndpointAsBaseUrlIsUsedAsIs() {
        assertEquals("https://host/v1/chat/completions",
                ChatEndpoint.resolve("https://host/v1/chat/completions", null));
        assertEquals("https://host/v1/chat/completions",
                ChatEndpoint.resolve("https://host/v1/chat/completions", "/v1/chat/completions"));
    }

    @Test
    void absoluteChatPathWinsOverBaseUrl() {
        assertEquals("https://other.example/v2/chat/completions",
                ChatEndpoint.resolve("https://host/v1", "https://other.example/v2/chat/completions"));
    }

    @Test
    void portAndUserInfoSurviveResolution() {
        assertEquals("http://user:pw@host:8080/openai/v1/chat/completions",
                ChatEndpoint.resolve("http://user:pw@host:8080/openai/v1", null));
    }

    @Test
    void baseUrlQueryIsPreservedForAzureStyleEndpoints() {
        assertEquals("https://host/v1/chat/completions?api-version=2024-02-01",
                ChatEndpoint.resolve("https://host/v1?api-version=2024-02-01", null));
        // A query on the chat path wins over the base URL query.
        assertEquals("https://host/v1/chat/completions?api-version=other",
                ChatEndpoint.resolve("https://host/v1?api-version=2024-02-01",
                        "/v1/chat/completions?api-version=other"));
    }

    @Test
    void missingOrRelativeBaseUrlFailsWithConfigurationMessage() {
        IllegalArgumentException missing = assertThrows(IllegalArgumentException.class,
                () -> ChatEndpoint.resolve(null, null));
        assertTrue(missing.getMessage().contains("base-url"));

        IllegalArgumentException blank = assertThrows(IllegalArgumentException.class,
                () -> ChatEndpoint.resolve("  ", null));
        assertTrue(blank.getMessage().contains("base-url"));

        // A host without a scheme is a config mistake; failing at startup beats a
        // confusing WebClient error on the first agent turn.
        assertThrows(IllegalArgumentException.class, () -> ChatEndpoint.resolve("host/v1", null));
        assertThrows(IllegalArgumentException.class, () -> ChatEndpoint.resolve("ftp://host/v1", null));
    }
}