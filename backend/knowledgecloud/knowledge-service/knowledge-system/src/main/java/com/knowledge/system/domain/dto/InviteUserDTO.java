package com.knowledge.system.domain.dto;

import com.knowledge.core.tool.domain.Cmd;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class InviteUserDTO implements Cmd {

	private String emails;	
	private Boolean sendEmail;
	private List<Long> roleIds;
}
