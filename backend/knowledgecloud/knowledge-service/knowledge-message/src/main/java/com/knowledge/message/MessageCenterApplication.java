package com.knowledge.message;

import com.knowledge.core.cloud.client.KnowledgeCloudApplication;
import com.knowledge.core.launch.KnowledgeApplication;
import com.knowledge.core.launch.constant.AppConstant;

@KnowledgeCloudApplication
public class MessageCenterApplication {

    public static void main(String[] args) {
        KnowledgeApplication.run(AppConstant.APPLICATION_MESSAGE_NAME, MessageCenterApplication.class, args);
    }
}
