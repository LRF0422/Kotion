package com.knowledge.filecenter.entity.dto.upload;

import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class AbortUploadSessionRequest {

    @Size(max = 512)
    private String reason;
}
