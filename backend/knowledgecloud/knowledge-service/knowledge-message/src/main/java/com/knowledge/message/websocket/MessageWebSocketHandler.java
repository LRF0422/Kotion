package com.knowledge.message.websocket;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.knowledge.core.tool.api.R;
import com.knowledge.message.domain.InstantMessage;
import com.knowledge.message.service.IInstantMessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.List;

/**
 * WebSocket Message Handler
 * Handles WebSocket connections and message processing
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MessageWebSocketHandler extends TextWebSocketHandler {

    private final WebSocketSessionManager sessionManager;
    private final IInstantMessageService instantMessageService;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        Long userId = Long.valueOf(session.getAttributes().get(WebSocketHandshakeInterceptor.USER_ID_KEY).toString());
        if (userId != null) {
            sessionManager.addSession(userId, session);

            // Send offline messages to the user
            List<InstantMessage> offlineMessages = instantMessageService.getUnreadMessages(userId);
            if (!offlineMessages.isEmpty()) {
                WebSocketMessage<List<InstantMessage>> wsMessage = new WebSocketMessage<>();
                wsMessage.setType(WebSocketMessageType.OFFLINE_MESSAGES);
                wsMessage.setData(offlineMessages);
                session.sendMessage(new TextMessage(JSONUtil.toJsonStr(R.data(wsMessage))));
                log.info("Sent {} offline messages to user: {}", offlineMessages.size(), userId);
            }

            // Send unread count
            sendUnreadCount(session, userId);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        sessionManager.removeSession(session);
        log.info("WebSocket connection closed, status: {}", status);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Long userId = sessionManager.getUserId(session);
        if (userId == null) {
            log.warn("Received message from unknown session: {}", session.getId());
            return;
        }

        try {
            JSONObject jsonMessage = JSONUtil.parseObj(message.getPayload());
            String type = jsonMessage.getStr("type");

            if (type == null) {
                sendError(session, "Message type is required");
                return;
            }

            switch (type.toUpperCase()) {
                case "SEND":
                    handleSendMessage(session, userId, jsonMessage);
                    break;
                case "READ":
                    handleMarkAsRead(session, userId, jsonMessage);
                    break;
                case "READ_ALL":
                    handleMarkAllAsRead(session, userId, jsonMessage);
                    break;
                case "PING":
                    handlePing(session);
                    break;
                case "GET_UNREAD_COUNT":
                    sendUnreadCount(session, userId);
                    break;
                default:
                    sendError(session, "Unknown message type: " + type);
            }
        } catch (Exception e) {
            log.error("Error handling message: {}", e.getMessage(), e);
            sendError(session, "Failed to process message: " + e.getMessage());
        }
    }

    /**
     * Handle sending a new message
     */
    private void handleSendMessage(WebSocketSession session, Long senderId, JSONObject jsonMessage) throws Exception {
        Long receiverId = jsonMessage.getLong("receiverId");
        String content = jsonMessage.getStr("content");
        String contentType = jsonMessage.getStr("contentType", "TEXT");

        if (receiverId == null || content == null) {
            sendError(session, "receiverId and content are required");
            return;
        }

        InstantMessage savedMessage = instantMessageService.sendMessage(senderId, receiverId, content, contentType);

        // Send confirmation to sender
        WebSocketMessage<InstantMessage> confirmMessage = new WebSocketMessage<>();
        confirmMessage.setType(WebSocketMessageType.MESSAGE_SENT);
        confirmMessage.setData(savedMessage);
        session.sendMessage(new TextMessage(JSONUtil.toJsonStr(R.data(confirmMessage))));

        // Send message to receiver if online
        WebSocketMessage<InstantMessage> receiverMessage = new WebSocketMessage<>();
        receiverMessage.setType(WebSocketMessageType.NEW_MESSAGE);
        receiverMessage.setData(savedMessage);
        boolean delivered = sessionManager.sendMessageToUser(receiverId, JSONUtil.toJsonStr(R.data(receiverMessage)));

        if (delivered) {
            instantMessageService.markAsDelivered(savedMessage.getId());
        }

        log.info("Message sent from {} to {}, delivered: {}", senderId, receiverId, delivered);
    }

    /**
     * Handle marking messages as read
     */
    private void handleMarkAsRead(WebSocketSession session, Long userId, JSONObject jsonMessage) throws Exception {
        Long messageId = jsonMessage.getLong("messageId");
        if (messageId == null) {
            sendError(session, "messageId is required");
            return;
        }

        instantMessageService.markAsRead(messageId, userId);

        // Notify the sender that message was read
        InstantMessage message = instantMessageService.getById(messageId);
        if (message != null && message.getSenderId() != null) {
            WebSocketMessage<Long> readNotification = new WebSocketMessage<>();
            readNotification.setType(WebSocketMessageType.MESSAGE_READ);
            readNotification.setData(messageId);
            sessionManager.sendMessageToUser(message.getSenderId(), JSONUtil.toJsonStr(R.data(readNotification)));
        }

        // Send updated unread count
        sendUnreadCount(session, userId);

        log.info("Message {} marked as read by user {}", messageId, userId);
    }

    /**
     * Handle marking all messages from a sender as read
     */
    private void handleMarkAllAsRead(WebSocketSession session, Long userId, JSONObject jsonMessage) throws Exception {
        Long senderId = jsonMessage.getLong("senderId");

        int count;
        if (senderId != null) {
            count = instantMessageService.markAllAsRead(userId, senderId);
        } else {
            count = instantMessageService.markAllAsRead(userId, null);
        }

        // Send updated unread count
        sendUnreadCount(session, userId);

        log.info("Marked {} messages as read for user {}", count, userId);
    }

    /**
     * Handle ping message (keep-alive)
     */
    private void handlePing(WebSocketSession session) throws Exception {
        WebSocketMessage<String> pongMessage = new WebSocketMessage<>();
        pongMessage.setType(WebSocketMessageType.PONG);
        pongMessage.setData("pong");
        session.sendMessage(new TextMessage(JSONUtil.toJsonStr(R.data(pongMessage))));
    }

    /**
     * Send unread message count to user
     */
    private void sendUnreadCount(WebSocketSession session, Long userId) throws Exception {
        int unreadCount = instantMessageService.getUnreadCount(userId);
        WebSocketMessage<Integer> countMessage = new WebSocketMessage<>();
        countMessage.setType(WebSocketMessageType.UNREAD_COUNT);
        countMessage.setData(unreadCount);
        session.sendMessage(new TextMessage(JSONUtil.toJsonStr(R.data(countMessage))));
    }

    /**
     * Send error message to session
     */
    private void sendError(WebSocketSession session, String errorMessage) throws Exception {
        WebSocketMessage<String> errorMsg = new WebSocketMessage<>();
        errorMsg.setType(WebSocketMessageType.ERROR);
        errorMsg.setData(errorMessage);
        session.sendMessage(new TextMessage(JSONUtil.toJsonStr(R.fail(errorMessage))));
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("WebSocket transport error for session: {}", session.getId(), exception);
        sessionManager.removeSession(session);
    }
}
