package com.knowledge.agent.api.feign;

import com.knowledge.agent.api.dto.AgentSessionDTO;
import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.List;

@FeignClient(AppConstant.APPLICATION_AGENT_SKILLS_NAME)
public interface IAgentClient {

    @GetMapping("/agent/session/{conversationId}/history")
    R<List<AgentSessionDTO>> getSessionHistory(@PathVariable("conversationId") String conversationId);

    @GetMapping("/api/v1/models")
    R<Object> listModels();
}
