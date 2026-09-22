package com.knowledge.agent.core.web.dto;

import lombok.Data;

/** Create / edit request for a user-declared trait. */
@Data
public class UpsertProfileTraitRequest {

    /** Allowlisted dimension key. */
    private String dimension;

    /** Trait value. */
    private String value;
}
