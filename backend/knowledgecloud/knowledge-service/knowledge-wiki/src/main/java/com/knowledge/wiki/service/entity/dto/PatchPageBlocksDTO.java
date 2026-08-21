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
 * Persistence and versioning are separate concerns: every patch writes block
 * rows immediately, but only a {@link #checkpoint} patch seals its own
 * {@code PageVersion}. Background autosaves are coalesced into the version
 * currently open for the editing session.
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

    /**
     * 是否作为一个独立的版本检查点封存。
     * <p>
     * {@code true} 用于用户主动保存（如 Ctrl+S）：强制封一个新版本，且该版本
     * 不会再被后续自动保存合并进去。缺省 {@code false}（后台自动保存）：当前
     * 编辑会话已打开的版本会吸收本次变更，不产生新版本。
     * </p>
     */
    private Boolean checkpoint;

}
