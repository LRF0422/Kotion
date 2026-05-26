package com.knowledge.core.permission.feign.dto;

import java.io.Serializable;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.Accessors;
import lombok.experimental.SuperBuilder;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Accessors(chain = true)
public class ResourceRegisterDTO implements Serializable {

	private String name;
	private String alias;
	private String content;
	private String category;
	private List<String> allowActions;
    
}
