package com.knowledge.core.permission.core.model;

import com.knowledge.core.tool.domain.Identifier;

public interface ISubject extends Identifier {
	Long getParent();

}
