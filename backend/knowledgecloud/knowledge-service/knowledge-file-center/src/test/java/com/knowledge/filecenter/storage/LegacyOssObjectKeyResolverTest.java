package com.knowledge.filecenter.storage;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.knowledge.core.oss.props.OssProperties;

class LegacyOssObjectKeyResolverTest {

    private LegacyOssObjectKeyResolver resolver;

    @BeforeEach
    void setUp() {
        OssProperties properties = new OssProperties();
        properties.setEndpoint("http://192.168.3.43:9000/");
        properties.setBucketName("knowledge");
        resolver = new LegacyOssObjectKeyResolver(properties);
    }

    @Test
    void returnsCanonicalObjectKeyUnchanged() {
        assertEquals("upload/20260902/file.webm", resolver.resolve("upload/20260902/file.webm"));
    }

    @Test
    void extractsObjectKeyFromLegacyMinioUrl() {
        assertEquals(
                "upload/20260902/file.webm",
                resolver.resolve("http://192.168.3.43:9000/knowledge/upload/20260902/file.webm"));
    }

    @Test
    void decodesPathAndIgnoresQueryAndFragment() {
        assertEquals(
                "upload/会议 录音.webm",
                resolver.resolve("http://192.168.3.43:9000/knowledge/upload/%E4%BC%9A%E8%AE%AE%20%E5%BD%95%E9%9F%B3.webm?x=1#part"));
    }

    @Test
    void rejectsForeignEndpoint() {
        assertThrows(
                IllegalArgumentException.class,
                () -> resolver.resolve("http://other.example:9000/knowledge/upload/file.webm"));
    }

    @Test
    void rejectsWrongBucket() {
        assertThrows(
                IllegalArgumentException.class,
                () -> resolver.resolve("http://192.168.3.43:9000/other/upload/file.webm"));
    }

    @Test
    void rejectsBlankPath() {
        assertThrows(IllegalArgumentException.class, () -> resolver.resolve(" "));
    }
}
