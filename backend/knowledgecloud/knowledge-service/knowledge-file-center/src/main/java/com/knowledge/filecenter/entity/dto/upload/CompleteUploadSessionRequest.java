package com.knowledge.filecenter.entity.dto.upload;

import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class CompleteUploadSessionRequest {

    @Size(max = 32)
    private String checksumAlgorithm;

    @Size(max = 255)
    private String checksum;
}
