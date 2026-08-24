package com.knowledge.wiki.service.doc;

import static com.knowledge.wiki.service.doc.BlockDocCodecTest.doc;
import static com.knowledge.wiki.service.doc.BlockDocCodecTest.paragraph;
import static com.knowledge.wiki.service.doc.BlockDocCodecTest.titleNode;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.knowledge.wiki.service.entity.PageCheckpoint;
import com.knowledge.wiki.service.entity.PageOp;
import com.knowledge.wiki.service.entity.dto.ReconcileDTO;
import com.knowledge.wiki.service.entity.vo.ApplyOpsVO;
import com.knowledge.wiki.service.entity.vo.PageDocVO;
import com.knowledge.wiki.service.entity.vo.RestorePageDocVO;
import com.knowledge.wiki.service.mapper.PageCheckpointMapper;
import com.knowledge.wiki.service.mapper.PageOpMapper;

@ExtendWith(MockitoExtension.class)
class PageDocCommandServiceTest {

    @Mock
    private PageDocService pageDocService;
    @Mock
    private PageOpService pageOpService;
    @Mock
    private PageCheckpointMapper pageCheckpointMapper;
    @Mock
    private PageOpMapper pageOpMapper;

    @InjectMocks
    private PageDocCommandService service;

    @Test
    void materializesFromNearestCheckpointAndOnlyLaterOps() {
        Map<String, Object> base = BlockDocCodec.assemble(BlockDocCodecTest.store(doc(Arrays.asList(
                titleNode("t1", "标题"), paragraph("p1", "第一版")))));
        PageCheckpoint checkpoint = checkpoint(1L, base);
        PageOp replace = entry(2L, replace("p1", paragraph("p1", "第二版")));
        PageOp insert = entry(3L, insert("p2", "z", paragraph("p2", "新增")));

        when(pageDocService.readRev(9L)).thenReturn(3L);
        when(pageCheckpointMapper.selectNearestAtOrBefore(9L, 3L)).thenReturn(checkpoint);
        when(pageDocService.readCheckpointDoc(checkpoint)).thenReturn(base);
        when(pageOpMapper.selectForReplay(9L, 1L, 3L)).thenReturn(Arrays.asList(replace, insert));

        PageDocVO result = service.materializeAtRev(9L, 3L);

        assertEquals(3L, result.getRev());
        assertEquals(3, result.getBlockCount());
        assertEquals("标题第二版新增", BlockDocCodec.extractText(result.getDoc()));
    }

    @Test
    void restoreReconcilesHistoricalDocForwardAndRecordsSourceRev() {
        Map<String, Object> historical = doc(Arrays.asList(titleNode("t1", "旧标题")));
        PageCheckpoint source = checkpoint(2L, historical);
        ApplyOpsVO applied = new ApplyOpsVO();
        applied.setRev(6L);
        applied.setOpsApplied(2);
        PageCheckpoint restoreCheckpoint = new PageCheckpoint();
        restoreCheckpoint.setId(77L);
        restoreCheckpoint.setRev(6L);

        when(pageOpService.ensureHead(9L)).thenReturn(5L);
        when(pageDocService.writeCheckpoint(9L, 5L, 42L, PageCheckpoint.KIND_USER, "恢复前自动保留"))
                .thenReturn(checkpoint(5L, historical));
        when(pageDocService.readRev(9L)).thenReturn(5L);
        when(pageCheckpointMapper.selectNearestAtOrBefore(9L, 2L)).thenReturn(source);
        when(pageDocService.readCheckpointDoc(source)).thenReturn(historical);
        when(pageOpMapper.selectForReplay(9L, 2L, 2L)).thenReturn(Arrays.asList());
        when(pageOpService.reconcile(eq(9L), any(ReconcileDTO.class), eq(42L))).thenReturn(applied);
        when(pageDocService.writeCheckpoint(9L, 6L, 42L, PageCheckpoint.KIND_RESTORE, "回到旧版", 2L))
                .thenReturn(restoreCheckpoint);

        RestorePageDocVO result = service.restore(9L, 2L, 42L, "回到旧版");

        ArgumentCaptor<ReconcileDTO> request = ArgumentCaptor.forClass(ReconcileDTO.class);
        verify(pageOpService).reconcile(eq(9L), request.capture(), eq(42L));
        assertEquals("旧标题", BlockDocCodec.extractText(request.getValue().getDoc()));
        assertEquals(6L, result.getRev());
        assertEquals(2, result.getOpsApplied());
        assertEquals(77L, result.getCheckpointId());
    }

    @Test
    void identicalRestoreStillRecordsAForwardRevision() {
        Map<String, Object> historical = doc(Arrays.asList(titleNode("t1", "相同内容")));
        PageCheckpoint source = checkpoint(2L, historical);
        ApplyOpsVO unchanged = new ApplyOpsVO();
        unchanged.setRev(5L);
        ApplyOpsVO marker = new ApplyOpsVO();
        marker.setRev(6L);
        PageCheckpoint restoreCheckpoint = new PageCheckpoint();
        restoreCheckpoint.setId(88L);
        restoreCheckpoint.setRev(6L);

        when(pageOpService.ensureHead(9L)).thenReturn(5L);
        when(pageDocService.writeCheckpoint(9L, 5L, 42L, PageCheckpoint.KIND_USER, "恢复前自动保留"))
                .thenReturn(checkpoint(5L, historical));
        when(pageDocService.readRev(9L)).thenReturn(5L);
        when(pageCheckpointMapper.selectNearestAtOrBefore(9L, 2L)).thenReturn(source);
        when(pageDocService.readCheckpointDoc(source)).thenReturn(historical);
        when(pageOpMapper.selectForReplay(9L, 2L, 2L)).thenReturn(Arrays.asList());
        when(pageOpService.reconcile(eq(9L), any(ReconcileDTO.class), eq(42L))).thenReturn(unchanged);
        when(pageOpService.recordStateCommand(9L, 42L)).thenReturn(marker);
        when(pageDocService.writeCheckpoint(9L, 6L, 42L, PageCheckpoint.KIND_RESTORE, null, 2L))
                .thenReturn(restoreCheckpoint);

        RestorePageDocVO result = service.restore(9L, 2L, 42L, null);

        verify(pageOpService).recordStateCommand(9L, 42L);
        assertEquals(6L, result.getRev());
        assertEquals(88L, result.getCheckpointId());
    }

    private static PageCheckpoint checkpoint(Long rev, Map<String, Object> doc) {
        PageCheckpoint checkpoint = new PageCheckpoint();
        checkpoint.setId(rev);
        checkpoint.setPageId(9L);
        checkpoint.setRev(rev);
        checkpoint.setDoc(new byte[] { 1 });
        checkpoint.setCreatedAt(LocalDateTime.now());
        return checkpoint;
    }

    private static PageOp entry(Long rev, Map<String, Object> op) {
        PageOp entry = new PageOp();
        entry.setPageId(9L);
        entry.setRev(rev);
        entry.setOps(BlockDocCodec.writeJson(Arrays.asList(op)));
        entry.setCreatedAt(LocalDateTime.now());
        return entry;
    }

    private static Map<String, Object> replace(String blockId, Map<String, Object> node) {
        Map<String, Object> op = new LinkedHashMap<>();
        op.put("op", "replace");
        op.put("blockId", blockId);
        op.put("node", node);
        return op;
    }

    private static Map<String, Object> insert(String blockId, String rank, Map<String, Object> node) {
        Map<String, Object> op = new LinkedHashMap<>();
        op.put("op", "insert");
        op.put("blockId", blockId);
        op.put("parentId", BlockDocCodec.TOP_LEVEL);
        op.put("rank", rank);
        op.put("node", node);
        return op;
    }
}
