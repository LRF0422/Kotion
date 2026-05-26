package com.knowledge.message.domain.dto;

import lombok.Data;
import lombok.EqualsAndHashCode;

import com.knowledge.core.common.base.PageDTO;

@Data
@EqualsAndHashCode(callSuper = false)
public class QueryMessageDTO extends PageDTO {

    private String type;
    private String status;
}
