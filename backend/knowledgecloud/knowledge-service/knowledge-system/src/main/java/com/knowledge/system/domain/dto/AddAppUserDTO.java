package com.knowledge.system.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

import java.io.Serializable;
import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
@SuperBuilder
public class AddAppUserDTO implements Serializable {

	private List<Long> userIds;
	private Long installedAppId;
	private Long roleId;

}
