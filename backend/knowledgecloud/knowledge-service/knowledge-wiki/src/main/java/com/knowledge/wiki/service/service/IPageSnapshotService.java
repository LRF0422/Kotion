package com.knowledge.wiki.service.service;

import java.util.List;

import com.knowledge.wiki.service.entity.BlockVersion;

/**
 * Page snapshot service for block version management.
 * Pure storage service - handles block snapshots independently from page versions.
 */
public interface IPageSnapshotService {

    /**
     * Create block snapshots for a published page version.
     * Called by Application layer after PageVersion status is updated to ACTIVE.
     *
     * @param pageId        the page ID
     * @param pageVersionId the published page version ID
     * @param pageVersion   the page version number (e.g., "1", "2")
     */
    void snapshotBlocks(Long pageId, Long pageVersionId, String pageVersion);

    /**
     * Restore a page from a snapshot.
     * Deletes existing blocks and restores them from the snapshot.
     *
     * @param pageId           the page ID to restore
     * @param versionId         the page version ID to restore from
     * @param fallbackContent   the page version content to use as fallback if no block snapshot exists
     */
    void restoreFromSnapshot(Long pageId, Long versionId, String fallbackContent);

    /**
     * Get all block snapshots for a specific page version.
     *
     * @param versionId  the page version ID
     * @return list of block snapshots
     */
    List<BlockVersion> getSnapshotBlocks(Long versionId);

    /**
     * Get all block snapshots for a specific page version by page version number.
     *
     * @param pageId        the page ID
     * @param pageVersion   the page version number (e.g., "1", "2")
     * @return list of block snapshots
     */
    List<BlockVersion> getSnapshotBlocksByVersion(Long pageId, String pageVersion);

}
