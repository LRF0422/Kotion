package com.knowledge.filecenter.skill;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.knowledge.filecenter.application.FileApplication;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;

@ExtendWith(MockitoExtension.class)
class WebDownloadSkillTest {

    @Mock
    private WebDownloadProperties properties;
    @Mock
    private FileApplication fileApplication;
    @InjectMocks
    private WebDownloadSkill skill;

    @Test
    void rejectsBlankUrl() {
        String result = skill.downloadFile("   ", null, null, null, null);
        assertTrue(result.startsWith("Error: Missing required parameter: fileUrl"), result);
    }

    @Test
    void rejectsInvalidUrlScheme() {
        String result = skill.downloadFile("ftp://example.com/a.txt", null, null, null, null);
        assertTrue(result.startsWith("Error: Invalid URL format"), result);
    }

    @Test
    void reportsDisabledSkill() {
        when(properties.isEnabled()).thenReturn(false);

        String result = skill.downloadFile("https://example.com/a.txt", null, null, null, null);

        assertTrue(result.contains("disabled"), result);
    }

    @Test
    void formatsDownloadResult() {
        when(properties.isEnabled()).thenReturn(true);
        when(properties.isHeadCheckEnabled()).thenReturn(true);
        KnowledgeFileVO vo = new KnowledgeFileVO();
        vo.setId(7L);
        vo.setName("report.pdf");
        vo.setSize(2048L);
        vo.setParentId(0L);
        vo.setRepositoryKey("repo");
        vo.setPath("upload/2026/report.pdf");
        when(fileApplication.downloadFromUrl(anyString(), any(), any(), any(), any())).thenReturn(vo);

        String result = skill.downloadFile("https://example.com/report.pdf", null, 0L, null, null);

        assertTrue(result.contains("# File Downloaded"), result);
        assertTrue(result.contains("**File ID:** 7"), result);
        assertTrue(result.contains("**Name:** report.pdf"), result);
        assertTrue(result.contains("2.0 KB"), result);
        assertTrue(result.contains("(2048 bytes)"), result);
        assertTrue(result.contains("**Storage Path:** upload/2026/report.pdf"), result);
        assertTrue(result.contains("**Source URL:** https://example.com/report.pdf"), result);
    }

    @Test
    void surfacesUnsafeUrlError() {
        when(properties.isEnabled()).thenReturn(true);
        when(properties.isHeadCheckEnabled()).thenReturn(true);
        when(fileApplication.downloadFromUrl(anyString(), any(), any(), any(), any()))
                .thenThrow(new IllegalArgumentException("Blocked private/loopback address for host: 127.0.0.1"));

        String result = skill.downloadFile("https://example.com/a.txt", null, null, null, null);

        assertTrue(result.startsWith("Error: Blocked private"), result);
    }

    @Test
    void surfacesDownloadFailure() {
        when(properties.isEnabled()).thenReturn(true);
        when(properties.isHeadCheckEnabled()).thenReturn(true);
        when(fileApplication.downloadFromUrl(anyString(), any(), any(), any(), any()))
                .thenThrow(new RuntimeException("connection lost"));

        String result = skill.downloadFile("https://example.com/a.txt", null, null, null, null);

        assertTrue(result.startsWith("Error downloading file: connection lost"), result);
    }
}
