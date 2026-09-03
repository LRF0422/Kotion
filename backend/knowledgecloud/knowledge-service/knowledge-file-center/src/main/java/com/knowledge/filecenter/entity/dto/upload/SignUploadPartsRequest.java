package com.knowledge.filecenter.entity.dto.upload;

import java.util.List;

import javax.validation.constraints.NotEmpty;

import lombok.Data;

@Data
public class SignUploadPartsRequest {

    @NotEmpty
    private List<Integer> partNumbers;
}
