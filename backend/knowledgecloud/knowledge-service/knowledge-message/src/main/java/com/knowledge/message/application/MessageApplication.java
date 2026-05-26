package com.knowledge.message.application;

import com.knowledge.core.message.core.message.IMessage;
import com.knowledge.core.message.core.message.MessageType;
import com.knowledge.core.message.core.message.SendMessageRequest;
import com.knowledge.core.message.core.message.SendMessageResult;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.message.domain.InstantMessage;
import com.knowledge.message.domain.KnowledgeMessage;
import com.knowledge.message.provider.IMessageProvider;
import com.knowledge.message.service.IInstantMessageService;
import com.knowledge.message.service.IKnowledgeMessageService;
import com.knowledge.message.websocket.WebSocketMessage;
import com.knowledge.message.websocket.WebSocketMessageType;
import com.knowledge.message.websocket.WebSocketSessionManager;
import cn.hutool.core.map.MapUtil;
import cn.hutool.extra.spring.SpringUtil;
import cn.hutool.json.JSONUtil;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import javax.annotation.PostConstruct;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@SuppressWarnings({ "rawtypes", "unchecked" })
public class MessageApplication {

    private final Map<MessageType, IMessageProvider> cache = MapUtil.newConcurrentHashMap();
    @Autowired
    private IKnowledgeMessageService knowledgeMessageService;
    @Autowired
    private WebSocketSessionManager sessionManager;
    @Autowired
    private IInstantMessageService instantMessageService;

    @Async
    public void sendRequest(SendMessageRequest<? extends IMessage> request) {
        IMessageProvider provider = cache.get(request.getMessage().getMessageType());
        if (provider != null) {
            SendMessageResult result;
            if (request.isGroup()) {
                result = provider.sendGroupMessages(request);
            } else {
                result = provider.sendSingleMessage(request);
            }
            logMessage(request, result);
        }
    }

    /**
     * Send WebSocket notification to a single user
     */
    public boolean sendWebSocketNotification(Long userId, String type, Map<String, Object> data) {
        WebSocketMessage<Map<String, Object>> wsMessage = new WebSocketMessage<>();
        wsMessage.setType(WebSocketMessageType.valueOf(type));
        wsMessage.setData(data);

        boolean delivered = sessionManager.sendMessageToUser(userId,
                JSONUtil.toJsonStr(R.data(wsMessage)));

        log.info("WebSocket notification sent to user {}, type: {}, delivered: {}",
                userId, type, delivered);

        return delivered;
    }

    /**
     * Send WebSocket notification to multiple users
     */
    public int sendBatchWebSocketNotification(String type, List<Long> userIds, Map<String, Object> data) {
        WebSocketMessage<Map<String, Object>> wsMessage = new WebSocketMessage<>();
        wsMessage.setType(WebSocketMessageType.valueOf(type));
        wsMessage.setData(data);

        String message = JSONUtil.toJsonStr(R.data(wsMessage));
        int successCount = 0;

        if (userIds != null && !userIds.isEmpty()) {
            for (Long userId : userIds) {
                if (sessionManager.sendMessageToUser(userId, message)) {
                    successCount++;
                }
            }
        }

        log.info("WebSocket batch notification sent to {} users, type: {}, success: {}",
                userIds != null ? userIds.size() : 0, type, successCount);

        return successCount;
    }

    /**
     * Send instant message (persisted to database and sent via WebSocket)
     *
     * @param senderId    Sender user ID
     * @param receiverId  Receiver user ID
     * @param content     Message content
     * @param contentType Content type (TEXT, INVITATION, etc.)
     * @param extraData   Extra data map (optional)
     * @return true if message was delivered via WebSocket
     */
    public boolean sendInstantMessage(Long senderId, Long receiverId, String content,
            String contentType, Map<String, Object> extraData) {
        // Convert extra data to JSON string
        String extraDataJson = extraData != null && !extraData.isEmpty() ? JSONUtil.toJsonStr(extraData) : null;

        // Save message to database
        InstantMessage savedMessage = instantMessageService.sendMessage(
                senderId, receiverId, content, contentType, null, extraDataJson);

        // Send via WebSocket if receiver is online
        WebSocketMessage<InstantMessage> wsMessage = new WebSocketMessage<>();
        wsMessage.setType(WebSocketMessageType.NEW_MESSAGE);
        wsMessage.setData(savedMessage);

        boolean delivered = sessionManager.sendMessageToUser(receiverId,
                JSONUtil.toJsonStr(R.data(wsMessage)));

        if (delivered) {
            instantMessageService.markAsDelivered(savedMessage.getId());
        }

        log.info("Instant message sent from {} to {}, id: {}, delivered: {}",
                senderId, receiverId, savedMessage.getId(), delivered);

        return delivered;
    }

    // @Async
    private void logMessage(SendMessageRequest<?> request, SendMessageResult result) {
        IMessage message = request.getMessage();
        List<KnowledgeUser> users = request.getTargetUsers();
        List<KnowledgeMessage> messages = users.stream().map(it -> {
            KnowledgeMessage m = new KnowledgeMessage();
            m.setBody(message.getBody());
            m.setSuccess(result.getResultDetails().get(it.getUserId()) == null);
            m.setUserId(it.getUserId());
            m.setSendUserId(request.getSenderId());
            m.setTitle(message.getTitle());
            m.setResendOnFail(request.isResendOnfail());
            m.setFailMessage(result.getResultDetails().get(it.getUserId()));
            m.setParams(message.getParams());
            m.setMessageType(message.getMessageType());
            return m;
        }).collect(Collectors.toList());
        this.knowledgeMessageService.saveBatch(messages);
    }

    @PostConstruct
    public void init() {
        Map<String, IMessageProvider> beans = SpringUtil.getBeansOfType(IMessageProvider.class);
        beans.values().forEach(it -> {
            cache.put(it.getType(), it);
        });

    }

}
