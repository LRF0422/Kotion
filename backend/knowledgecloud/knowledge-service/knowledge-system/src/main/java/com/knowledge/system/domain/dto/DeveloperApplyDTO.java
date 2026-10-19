package com.knowledge.system.domain.dto;

import java.io.Serializable;

import javax.validation.constraints.Email;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

import com.knowledge.system.domain.enums.DeveloperIdType;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

/**
 * 开发者认证提交 / 重新提交。
 */
@Data
@ApiModel(value = "DeveloperApplyDTO对象", description = "开发者认证提交")
public class DeveloperApplyDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 对外展示的开发者主体名称（会写到插件详情的「开发者」）。 */
    @ApiModelProperty(value = "开发者名称")
    @NotBlank(message = "开发者名称不能为空")
    @Size(max = 64, message = "开发者名称长度不能超过64")
    private String displayName;

    @ApiModelProperty(value = "联系人")
    @NotBlank(message = "联系人不能为空")
    @Size(max = 64, message = "联系人长度不能超过64")
    private String contactName;

    @ApiModelProperty(value = "联系邮箱")
    @NotBlank(message = "联系邮箱不能为空")
    @Email(message = "联系邮箱格式不正确")
    @Size(max = 128, message = "联系邮箱长度不能超过128")
    private String contactEmail;

    @ApiModelProperty(value = "联系电话")
    @NotBlank(message = "联系电话不能为空")
    @Size(max = 32, message = "联系电话长度不能超过32")
    @Pattern(regexp = "^[0-9+\\-\\s()]{5,32}$", message = "联系电话格式不正确")
    private String contactPhone;

    @ApiModelProperty(value = "证件类型")
    @NotNull(message = "请选择证件类型")
    private DeveloperIdType idType;

    @ApiModelProperty(value = "证件号码")
    @NotBlank(message = "证件号码不能为空")
    @Size(max = 128, message = "证件号码长度不能超过128")
    private String idNumber;

    @ApiModelProperty(value = "开发者简介")
    @Size(max = 1000, message = "开发者简介长度不能超过1000")
    private String intro;

    /** 已上传的资质材料对象路径（可选）。 */
    @ApiModelProperty(value = "资质材料对象路径")
    @Size(max = 512, message = "资质材料路径长度不能超过512")
    private String qualificationPath;
}
