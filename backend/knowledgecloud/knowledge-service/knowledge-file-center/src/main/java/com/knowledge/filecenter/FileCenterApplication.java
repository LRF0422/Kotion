package com.knowledge.filecenter;

import com.knowledge.core.cloud.client.KnowledgeCloudApplication;
import com.knowledge.core.launch.KnowledgeApplication;
import com.knowledge.core.launch.constant.AppConstant;

@KnowledgeCloudApplication
public class FileCenterApplication {

    public static void main(String[] args) {
        KnowledgeApplication.run(AppConstant.APPLICATION_FILE_CENTER_NAME, FileCenterApplication.class, args);
    }
}