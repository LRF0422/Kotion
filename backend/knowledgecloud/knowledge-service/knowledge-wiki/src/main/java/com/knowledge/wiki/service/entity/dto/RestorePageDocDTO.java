package com.knowledge.wiki.service.entity.dto;

import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

import lombok.Data;

/** Browser request for a non-destructive, forward document restore. */
@Data
public class RestorePageDocDTO {

    @NotNull(message = "目标版本不能为空")
    @Min(value = 0, message = "目标版本不能小于0")
    private Long targetRev;

    @NotBlank(message = "客户端ID不能为空")
    private String clientId;

    @Size(max = 255, message = "恢复标签不能超过255个字符")
    private String label;
}
