package com.knowledge.core.tool.domain;

import com.knowledge.core.tool.api.R;

public interface Executor<CMD extends Cmd, R> {
	R execute(CMD cmd);
}
