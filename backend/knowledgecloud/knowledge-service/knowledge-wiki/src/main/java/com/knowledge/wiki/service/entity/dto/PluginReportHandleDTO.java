package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class PluginReportHandleDTO implements Serializable {

    /** true = 采纳并处理（必要时下架），false = 驳回举报。 */
    @NotNull(message = "处理结果不能为空")
    private Boolean approved;

    @Size(max = 500, message = "处理说明不能超过500")
    private String note;
}
