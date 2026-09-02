package com.knowledge.filecenter.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Answers.RETURNS_SELF;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;

import org.junit.jupiter.api.Test;

import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.filecenter.entity.KnowledgeFile;

import cn.hutool.core.util.StrUtil;

class FileServiceImplTest {

    @Test
    void newRecordReceivesApplicationFileKeyWithoutChangingPath() {
        FileServiceImpl service = spy(new FileServiceImpl());
        doReturn(true).when(service).save(any(KnowledgeFile.class));
        KnowledgeFile file = new KnowledgeFile();
        file.setType(FileType.FILE);
        file.setName("meeting.webm");
        file.setPath("upload/20260902/meeting.webm");

        service.createOrSaveFile(file);

        assertEquals("upload/20260902/meeting.webm", file.getPath());
        assertFalse(StrUtil.isBlank(file.getFileKey()));
    }

    @Test
    void copySharesPathButReceivesIndependentFileKey() {
        FileServiceImpl service = spy(new FileServiceImpl());
        KnowledgeFile source = new KnowledgeFile();
        source.setId(1L);
        source.setType(FileType.FILE);
        source.setName("meeting.webm");
        source.setPath("upload/20260902/meeting.webm");
        source.setFileKey("source-record-key");
        source.setParentId(0L);
        source.setAncestors("0");
        doReturn(source).when(service).getById(1L);
        doReturn(true).when(service).save(any(KnowledgeFile.class));

        KnowledgeFile copy = service.copyFile(1L, 0L);

        assertEquals(source.getPath(), copy.getPath());
        assertNotEquals(source.getFileKey(), copy.getFileKey());
        assertFalse(StrUtil.isBlank(copy.getFileKey()));
    }

    @Test
    void selfMoveIsRejectedWithoutWriting() {
        FileServiceImpl service = spy(new FileServiceImpl());

        assertThrows(IllegalArgumentException.class, () -> service.moveFile(1L, 1L));

        verify(service, never()).updateById(any(KnowledgeFile.class));
    }

    @Test
    void movingFolderIntoDescendantIsRejectedWithoutWriting() {
        FileServiceImpl service = spy(new FileServiceImpl());
        KnowledgeFile source = file(1L, FileType.FOLDER, 0L, "0", 0);
        KnowledgeFile target = file(3L, FileType.FOLDER, 2L, "0,1,2", 0);
        doReturn(source).when(service).getById(1L);
        doReturn(target).when(service).getById(3L);

        assertThrows(IllegalArgumentException.class, () -> service.moveFile(1L, 3L));

        assertEquals(Long.valueOf(0L), source.getParentId());
        assertEquals("0", source.getAncestors());
        verify(service, never()).updateById(any(KnowledgeFile.class));
    }

    @Test
    void invalidTargetsAreRejectedWithoutWriting() {
        assertInvalidTarget(null);
        assertInvalidTarget(file(2L, FileType.FOLDER, 0L, "0", 1));
        assertInvalidTarget(file(2L, FileType.FILE, 0L, "0", 0));
    }

    @Test
    void validMoveUpdatesParentAndAncestors() {
        FileServiceImpl service = spy(new FileServiceImpl());
        KnowledgeFile source = file(1L, FileType.FOLDER, 0L, "0", 0);
        KnowledgeFile target = file(20L, FileType.FOLDER, 10L, "0,10", 0);
        LambdaQueryChainWrapper<KnowledgeFile> query = mock(LambdaQueryChainWrapper.class, RETURNS_SELF);
        doReturn(source).when(service).getById(1L);
        doReturn(target).when(service).getById(20L);
        doReturn(true).when(service).updateById(source);
        doReturn(query).when(service).lambdaQuery();
        when(query.list()).thenReturn(Collections.emptyList());

        service.moveFile(1L, 20L);

        assertEquals(Long.valueOf(20L), source.getParentId());
        assertEquals("0,10,20", source.getAncestors());
        verify(service).updateById(source);
    }

    private void assertInvalidTarget(KnowledgeFile target) {
        FileServiceImpl service = spy(new FileServiceImpl());
        KnowledgeFile source = file(1L, FileType.FILE, 0L, "0", 0);
        doReturn(source).when(service).getById(1L);
        doReturn(target).when(service).getById(2L);

        assertThrows(IllegalArgumentException.class, () -> service.moveFile(1L, 2L));

        assertEquals(Long.valueOf(0L), source.getParentId());
        assertEquals("0", source.getAncestors());
        verify(service, never()).updateById(any(KnowledgeFile.class));
    }

    private KnowledgeFile file(Long id, FileType type, Long parentId, String ancestors, Integer trashed) {
        KnowledgeFile file = new KnowledgeFile();
        file.setId(id);
        file.setType(type);
        file.setParentId(parentId);
        file.setAncestors(ancestors);
        file.setTrashed(trashed);
        return file;
    }
}
