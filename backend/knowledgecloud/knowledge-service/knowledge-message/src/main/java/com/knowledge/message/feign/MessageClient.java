package com.knowledge.message.feign;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.message.core.message.IMessage;
import com.knowledge.core.message.core.message.SendMessageRequest;
import com.knowledge.core.message.feign.IMessageClient;
import com.knowledge.core.tool.api.R;
import com.knowledge.message.application.MessageApplication;

@RestController
public class MessageClient implements IMessageClient {

    @Autowired
    private MessageApplication messageApplication;

    @Override
    public <T extends IMessage> R<?> sendMessage(SendMessageRequest<T> request) {
        messageApplication.sendRequest(request);
        return R.success();
    }

    @Override
    public R<Boolean> sendWebSocketNotification(Long userId, String type, Map<String, Object> data) {
        boolean delivered = messageApplication.sendWebSocketNotification(userId, type, data);
        return R.data(delivered);
    }

    @Override
    public R<Integer> sendBatchWebSocketNotification(String type, Map<String, Object> payload) {
        @SuppressWarnings("unchecked")
        java.util.List<Long> userIds = (java.util.List<Long>) payload.get("userIds");
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) payload.get("data");

        int successCount = messageApplication.sendBatchWebSocketNotification(type, userIds, data);
        return R.data(successCount);
    }

    @Override
    public R<Boolean> sendInstantMessage(Long senderId, Long receiverId, String content,
            String contentType, Map<String, Object> extraData) {
        boolean delivered = messageApplication.sendInstantMessage(senderId, receiverId, content, contentType,
                extraData);
        return R.data(delivered);
    }

}
