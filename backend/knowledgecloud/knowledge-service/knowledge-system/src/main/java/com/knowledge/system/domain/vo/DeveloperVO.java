package com.knowledge.system.domain.vo;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.knowledge.system.domain.enums.DeveloperIdType;
import com.knowledge.system.domain.enums.DeveloperStatus;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

/**
 * 开发者本人看到的认证档案。证件号只返回掩码值。
 */
@Data
@ApiModel(value = "DeveloperVO对象", description = "开发者认证档案")
public class DeveloperVO implements Serializable {

    private static final long serialVersionUID = 1L;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long userId;

    private String userName;
    private String displayName;
    private String contactName;
    private String contactEmail;
    private String contactPhone;
    private DeveloperIdType idType;

    @ApiModelProperty(value = "掩码后的证件号")
    private String idNumberMasked;

    private String intro;
    private String qualificationPath;
    private DeveloperStatus status;
    private String rejectReason;
    private String reviewerName;
    private LocalDateTime reviewTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
