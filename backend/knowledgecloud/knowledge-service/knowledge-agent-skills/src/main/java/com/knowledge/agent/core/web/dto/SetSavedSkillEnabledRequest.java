package com.knowledge.agent.core.web.dto;

import lombok.Data;

/** Enable/disable request for one saved personal skill. */
@Data
public class SetSavedSkillEnabledRequest {
    private Boolean enabled;
}
