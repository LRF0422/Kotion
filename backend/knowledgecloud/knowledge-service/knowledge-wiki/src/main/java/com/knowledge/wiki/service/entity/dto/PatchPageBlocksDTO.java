package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;
import java.util.List;

import javax.validation.Valid;
import javax.validation.constraints.NotNull;

import lombok.Data;

/**
 * DTO for incremental (block-level) page save.
 *
 * <p>
 * Sent by frontend DirtyTracker on each auto-save. Contains only the blocks
 * that actually changed, plus the full ordered list of top-level blockIds
 * so the backend can reconcile structure and detect deletions.
 * </p>
 *
 * <p>
 * Save is publish: every successful patch atomically seals the changes
 * into a brand-new ACTIVE {@code PageVersion}, so there is no separate
 * publish flag.
 * </p>
 */
@Data
public class PatchPageBlocksDTO implements Serializable {

    /**
     * 页面 ID。
     */
    @NotNull(message = "页面ID不能为空")
    private Long pageId;

    /**
     * 可选：顶层块的有序 ID 列表（旧协议字段）。
     * 顶层排序现由每个块的分数排名 {@code attrs.rank} 决定，故该字段可为空。
     */
    private List<String> blockOrder;

    /**
     * 本次发生变更的块列表（仅顶层）。
     */
    @Valid
    private List<BlockPatchItemDTO> changes;

}
