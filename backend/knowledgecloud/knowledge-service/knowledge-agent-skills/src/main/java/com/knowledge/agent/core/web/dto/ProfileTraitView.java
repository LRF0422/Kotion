package com.knowledge.agent.core.web.dto;

import com.knowledge.agent.core.profile.ProfileDimension;
import com.knowledge.agent.core.profile.ProfileTrait;
import lombok.Data;

/** Client-facing view of one profile trait (never exposes raw evidence here). */
@Data
public class ProfileTraitView {

    private String traitId;
    private String dimension;
    private String dimensionLabel;
    private String value;
    private int confidence;
    private String source;
    private String status;
    private boolean locked;
    private int evidenceCount;
    private long firstSeen;
    private long lastSeen;
    private long updateTime;

    public static ProfileTraitView of(ProfileTrait trait) {
        ProfileTraitView view = new ProfileTraitView();
        view.setTraitId(trait.getTraitId());
        view.setDimension(trait.getDimension());
        ProfileDimension dimension = ProfileDimension.fromKey(trait.getDimension());
        view.setDimensionLabel(dimension != null ? dimension.getLabel() : trait.getDimension());
        view.setValue(trait.getTraitValue());
        view.setConfidence(trait.getConfidence());
        view.setSource(trait.getSource());
        view.setStatus(trait.getStatus());
        view.setLocked(trait.isLocked());
        view.setEvidenceCount(trait.getEvidenceCount());
        view.setFirstSeen(trait.getFirstSeen());
        view.setLastSeen(trait.getLastSeen());
        view.setUpdateTime(trait.getUpdateTime());
        return view;
    }
}
