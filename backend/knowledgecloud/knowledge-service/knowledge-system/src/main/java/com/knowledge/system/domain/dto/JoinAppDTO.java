package com.knowledge.system.domain.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class JoinAppDTO implements Serializable {

	private Long appId;
	private JoinType joinType;


	@Data
	public static class JoinUser {
		private Long userId;
	}


	public enum JoinType {
		INDIVIDUAL,
		GROUP
	}
}
