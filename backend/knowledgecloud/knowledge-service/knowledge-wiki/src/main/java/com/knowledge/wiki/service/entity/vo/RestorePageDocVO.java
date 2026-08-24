package com.knowledge.wiki.service.entity.vo;

import lombok.Data;

/** Outcome of restoring an old document as a new forward revision. */
@Data
public class RestorePageDocVO {

    private Long targetRev;
    private Long rev;
    private int opsApplied;
    private Long checkpointId;
}
