package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;
import java.util.List;

import javax.validation.Valid;
import javax.validation.constraints.NotEmpty;
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
     * 当前文档中所有顶层块的有序 ID 列表。
     * 用于：
     * 1) 同步顶层块的排序；
     * 2) 检测被删除的块（前端快照与当前差异）。
     */
    @NotEmpty(message = "块顺序不能为空")
    private List<String> blockOrder;

    /**
     * 本次发生变更的块列表（仅顶层）。
     */
    @Valid
    private List<BlockPatchItemDTO> changes;

}
