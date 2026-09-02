package com.knowledge.filecenter.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;

import org.junit.jupiter.api.Test;

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
}
