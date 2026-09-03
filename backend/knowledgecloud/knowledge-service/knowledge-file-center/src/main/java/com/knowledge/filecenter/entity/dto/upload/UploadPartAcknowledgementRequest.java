package com.knowledge.filecenter.entity.dto.upload;

import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class UploadPartAcknowledgementRequest {

    @NotNull
    @Min(1)
    private Long sizeBytes;

    @NotBlank
    @Size(max = 255)
    private String etag;

    @Size(max = 255)
    private String providerChecksum;

    @Size(max = 32)
    private String checksumAlgorithm;

    @Size(max = 255)
    private String checksum;
}
