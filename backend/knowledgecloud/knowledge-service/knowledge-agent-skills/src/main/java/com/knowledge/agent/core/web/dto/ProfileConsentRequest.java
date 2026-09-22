package com.knowledge.agent.core.web.dto;

import lombok.Data;

/** Opt-in / opt-out request. */
@Data
public class ProfileConsentRequest {

    private boolean enabled;
}
