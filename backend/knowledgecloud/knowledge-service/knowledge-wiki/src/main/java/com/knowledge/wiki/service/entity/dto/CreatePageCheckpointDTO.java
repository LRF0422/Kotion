package com.knowledge.wiki.service.entity.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

import lombok.Data;

/** Browser request for an explicit USER restore point. */
@Data
public class CreatePageCheckpointDTO {

    @NotBlank(message = "客户端ID不能为空")
    private String clientId;

    @Size(max = 255, message = "检查点标签不能超过255个字符")
    private String label;
}
