package com.knowledge.message.service;

import java.io.File;
import java.util.Map;
import java.util.Objects;

public interface IKnowledgeMailService  {

    void send(String from, String to, String title, String content, String tenantId);

    void sendWithTemplate(String from, String to, String templateName, Map<String, Objects> params, String tenantId);

    void sendWithAttachment(String form, String to, String title, String content, File attachment);
}
