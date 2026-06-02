package com.knowledge.wiki.service.entity.dto;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import com.knowledge.wiki.service.service.impl.BlockStorageService;

/**
 * Response DTO for block patch operations.
 * Reports statistics about what was actually changed.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PatchResultDTO {

    private int created;
    private int updated;
    private int deleted;
    private int skipped;

    @Builder.Default
    private List<String> conflictBlockIds = Collections.emptyList();

    /**
     * Block versions after this patch (blockId -> new version number).
     * The frontend DirtyTracker uses this to populate prevVersion in
     * subsequent patch requests for optimistic concurrency.
     */
    private Map<String, Integer> blockVersions;

    /**
     * New ACTIVE {@code PageVersion} number (e.g. "3") sealed by this patch.
     * {@code null} when the patch produced no actual changes (skipped).
     */
    private String pageVersion;

    /**
     * New ACTIVE {@code PageVersion} id sealed by this patch.
     * {@code null} when the patch produced no actual changes (skipped).
     */
    private Long pageVersionId;

    /**
     * Convert from {@link BlockStorageService.PatchResult} inner class.
     */
    public static PatchResultDTO from(BlockStorageService.PatchResult result) {
        if (result == null) {
            return PatchResultDTO.builder().build();
        }
        return PatchResultDTO.builder()
                .created(result.getCreated())
                .updated(result.getUpdated())
                .deleted(result.getDeleted())
                .skipped(result.getSkipped())
                .conflictBlockIds(result.getConflictBlockIds() != null
                        ? result.getConflictBlockIds()
                        : Collections.emptyList())
                .blockVersions(result.getBlockVersions())
                .pageVersion(result.getPageVersion())
                .pageVersionId(result.getPageVersionId())
                .build();
    }
}
