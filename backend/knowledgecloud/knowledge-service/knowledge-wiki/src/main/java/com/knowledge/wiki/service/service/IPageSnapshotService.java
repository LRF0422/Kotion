package com.knowledge.wiki.service.service;

import java.util.List;

import com.knowledge.wiki.service.entity.BlockVersion;

/**
 * Page snapshot service for block version management.
 * Pure storage service - handles block snapshots independently from page versions.
 */
public interface IPageSnapshotService {

    /**
     * Seal pending block change rows under a published page version.
     * <p>
     * Diff-only model: only the rows still pending ({@code page_version_id IS
     * NULL}) are tagged with {@code page_version_id} / {@code page_version}.
     * No carry-forward of unchanged blocks - reads use
     * {@link #getPageStateAtVersion(Long, String)} to walk back through history.
     * </p>
     * <p>
     * Idempotent and safe to call repeatedly against the SAME version: an
     * autosave-sealed version stays open and absorbs each subsequent autosave,
     * which simply tags the newly pending rows under it.
     * </p>
     *
     * @param pageId        the page ID
     * @param pageVersionId the published page version ID
     * @param pageVersion   the page version number (e.g., "1", "2")
     */
    void snapshotBlocks(Long pageId, Long pageVersionId, String pageVersion);

    /**
     * Cumulative change summary for everything sealed under a page version.
     * <p>
     * Needed because an autosave-sealed version keeps absorbing later
     * autosaves, so its summary cannot be derived from the triggering patch
     * alone. Counts DISTINCT blocks per action, not rows.
     * </p>
     *
     * @param pageVersionId sealed page version id
     * @return e.g. {@code "3 added, 12 edited"}, or {@code null} when nothing is
     *         sealed under this version
     */
    String summarizeVersion(Long pageVersionId);

    /**
     * Get the diff rows that were sealed under a specific page version.
     * Returns only the blocks that changed at this version (create/update/delete
     * events), not the full page state. Use
     * {@link #getPageStateAtVersion(Long, String)} for the full state.
     *
     * @param versionId  the page version ID
     * @return list of block change rows tagged with this page version ID
     */
    List<BlockVersion> getSnapshotBlocks(Long versionId);

    /**
     * Get the diff rows sealed under a specific page version by version number.
     * Returns only the blocks that changed at this version (create/update/delete
     * events), not the full page state. Use
     * {@link #getPageStateAtVersion(Long, String)} for the full state.
     *
     * @param pageId        the page ID
     * @param pageVersion   the page version number (e.g., "1", "2")
     * @return list of block change rows tagged with this page version
     */
    List<BlockVersion> getSnapshotBlocksByVersion(Long pageId, String pageVersion);

    /**
     * Get the full block state of a page as of the given page version, by
     * walking back through {@code wiki_block_version} history.
     * <p>
     * For every block that was touched at or before {@code pageVersion}, the
     * row with the highest {@code page_version &lt;= pageVersion} is returned,
     * excluding rows whose latest action is {@code delete}. Result is sorted by
     * {@code sort_order}.
     * </p>
     *
     * @param pageId      the page ID
     * @param pageVersion the target page version number (e.g., "1", "2")
     * @return list of block versions representing the page state at that version
     */
    List<BlockVersion> getPageStateAtVersion(Long pageId, String pageVersion);

}
