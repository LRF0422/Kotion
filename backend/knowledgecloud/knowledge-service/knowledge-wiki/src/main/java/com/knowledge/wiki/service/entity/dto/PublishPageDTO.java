package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import lombok.Data;

/**
 * DTO for the standalone "publish" endpoint.
 * <p>
 * The publish flow no longer accepts a full content payload — the backend
 * derives the new version from the current block rows (wiki_page_block).
 * Clients only supply optional metadata such as a change summary.
 * </p>
 */
@Data
public class PublishPageDTO implements Serializable {

    /**
     * Optional human-readable summary of the changes made in this version.
     */
    private String changeSummary;
}
