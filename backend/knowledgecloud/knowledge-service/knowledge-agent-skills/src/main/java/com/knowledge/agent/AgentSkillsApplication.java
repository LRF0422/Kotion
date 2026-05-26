package com.knowledge.agent;

import com.knowledge.core.cloud.client.KnowledgeCloudApplication;
import com.knowledge.core.launch.KnowledgeApplication;
import com.knowledge.core.launch.constant.AppConstant;
import org.springframework.scheduling.annotation.EnableScheduling;

@KnowledgeCloudApplication
@EnableScheduling
public class AgentSkillsApplication {

    public static void main(String[] args) {
        KnowledgeApplication.run(AppConstant.APPLICATION_AGENT_SKILLS_NAME, AgentSkillsApplication.class, args);
    }
}
