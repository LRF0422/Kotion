package com.knowledge.core.tool;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class AppInfo implements Serializable {

	private String applicationName;
	private String description;
	private String clientId;
	private String logo;
	private List<DefaultUserGroup> defaultUserGroups;


	@Data
	public static class DefaultUserGroup implements Serializable {

		private String name;
		private String alias;
		private Boolean admin;

	}
}
