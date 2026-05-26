package com.knowledge.wiki.service;


import com.knowledge.core.cloud.client.KnowledgeCloudApplication;
import com.knowledge.core.launch.KnowledgeApplication;
import com.knowledge.core.launch.constant.AppConstant;

@KnowledgeCloudApplication
public class KnowledgeWikiServiceApplication {

    public static void main(String[] args) {
        KnowledgeApplication.run(AppConstant.APPLICATION_WIKI_NAME, KnowledgeWikiServiceApplication.class, args);
    }

}
