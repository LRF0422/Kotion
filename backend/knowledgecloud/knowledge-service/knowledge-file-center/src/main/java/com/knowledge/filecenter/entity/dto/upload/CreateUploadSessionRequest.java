package com.knowledge.filecenter.entity.dto.upload;

import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class CreateUploadSessionRequest {

    @NotBlank
    @Pattern(regexp = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
    private String clientUuid;

    @Size(max = 64)
    private String repositoryKey;

    private Long parentId;

    @NotBlank
    @Size(max = 512)
    private String originalName;

    @Size(max = 255)
    private String contentType;

    @NotNull
    @Min(1)
    private Long expectedSize;

    @Size(max = 32)
    private String checksumAlgorithm;

    @Size(max = 255)
    private String checksum;
}
