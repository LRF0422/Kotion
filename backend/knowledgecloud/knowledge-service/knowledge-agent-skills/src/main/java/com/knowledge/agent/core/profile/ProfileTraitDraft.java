package com.knowledge.agent.core.profile;

import lombok.Data;

/**
 * One raw extraction candidate as emitted by the model, BEFORE the privacy
 * gate. Kept as a distinct type so it is impossible to persist a draft without
 * passing it through {@link ProfileSensitivity}.
 */
@Data
public class ProfileTraitDraft {

    private String dimension;
    private String value;
    private int confidence;
    private String evidence;

    public ProfileTraitDraft() {
    }

    public ProfileTraitDraft(String dimension, String value, int confidence, String evidence) {
        this.dimension = dimension;
        this.value = value;
        this.confidence = confidence;
        this.evidence = evidence;
    }
}
