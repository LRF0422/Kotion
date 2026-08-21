package com.knowledge.wiki.service.entity.vo;

import java.util.Map;

import lombok.Data;

/**
 * A materialised document plus the rev it represents.
 * <p>
 * The rev is not decoration: a writer needs it as the {@code baseRev} of its next
 * op batch, and the host uses it as the watermark that tells it a server-side
 * write happened and its local document needs catching up.
 * </p>
 */
@Data
public class PageDocVO {

    /**
     * {@code {type: "doc", content: [...]}}. Every block's subtree is returned as
     * stored.
     */
    private Map<String, Object> doc;

    private Long rev;

    private int blockCount;

}
