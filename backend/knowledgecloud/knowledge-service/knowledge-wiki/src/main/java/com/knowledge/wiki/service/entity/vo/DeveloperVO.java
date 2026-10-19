package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.knowledge.wiki.service.entity.enums.DeveloperIdType;
import com.knowledge.wiki.service.entity.enums.DeveloperStatus;

import lombok.Data;

/**
 * 开发者本人看到的认证档案。证件号只返回掩码值。
 */
@Data
public class DeveloperVO implements Serializable {

    private Long id;
    private Long userId;
    private String userName;
    private String displayName;
    private String contactName;
    private String contactEmail;
    private String contactPhone;
    private DeveloperIdType idType;
    /** 掩码后的证件号，例如 110***********1234。 */
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
