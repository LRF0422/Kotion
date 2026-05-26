package com.knowledge.system.dto;

import lombok.Data;

import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.NotNull;
import java.io.Serializable;
import java.util.List;

@Data
public class DeleteClientUserDTO implements Serializable {

	@NotNull(message = "应用id不能为空")
	private Long clientId;

	@NotEmpty(message = "用户id不能为空")
	private List<Long> userIds;
}
