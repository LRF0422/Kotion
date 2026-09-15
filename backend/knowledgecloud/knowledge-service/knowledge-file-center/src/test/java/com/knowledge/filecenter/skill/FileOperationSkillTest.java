package com.knowledge.filecenter.skill;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.Arrays;
import java.util.Collections;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.filecenter.application.FileApplication;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;

@ExtendWith(MockitoExtension.class)
class FileOperationSkillTest {

    @Mock
    private FileApplication fileApplication;

    @InjectMocks
    private FileOperationSkill skill;

    @Test
    void searchFileFormatsMatchesWithFoldersFirst() {
        KnowledgeFileVO folder = file(1L, "Reports", FileType.FOLDER, null, null);
        KnowledgeFileVO document = file(2L, "report.md", FileType.FILE, "md", 12L);
        when(fileApplication.searchFiles(eq("report"), any())).thenReturn(Arrays.asList(document, folder));

        String result = skill.searchFile("report", null, null);

        assertTrue(result.contains("**Matches:** 2"), result);
        assertTrue(result.contains("**Reports**"), result);
        assertTrue(result.contains("**report.md**"), result);
        assertTrue(result.contains("Extension: md"), result);
        assertTrue(result.contains("Size: 12 bytes"), result);
        assertTrue(result.indexOf("**Reports**") < result.indexOf("**report.md**"));
    }

    @Test
    void searchFileRejectsBlankKeyword() {
        String result = skill.searchFile("   ", null, null);

        assertTrue(result.startsWith("Error: Missing required parameter: keyword"), result);
    }

    @Test
    void searchFileHandlesNoMatches() {
        when(fileApplication.searchFiles(eq("missing"), any())).thenReturn(Collections.emptyList());

        String result = skill.searchFile("missing", null, 5);

        assertTrue(result.contains("No files or folders matched"), result);
    }

    @Test
    void searchFileLimitsResults() {
        when(fileApplication.searchFiles(eq("txt"), any())).thenReturn(Arrays.asList(
                file(1L, "a.txt", FileType.FILE, "txt", 1L),
                file(2L, "b.txt", FileType.FILE, "txt", 1L),
                file(3L, "c.txt", FileType.FILE, "txt", 1L)));

        String result = skill.searchFile("txt", null, 2);

        assertTrue(result.contains("Showing 2 of 3 matches"), result);
    }

    private static KnowledgeFileVO file(Long id, String name, FileType type, String suffix, Long size) {
        KnowledgeFileVO vo = new KnowledgeFileVO();
        vo.setId(id);
        vo.setName(name);
        vo.setType(type);
        vo.setSuffix(suffix);
        vo.setSize(size);
        return vo;
    }
}
