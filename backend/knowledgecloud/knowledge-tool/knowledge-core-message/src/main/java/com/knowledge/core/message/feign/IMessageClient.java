package com.knowledge.core.message.feign;

import java.util.List;
import java.util.Map;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import com.knowledge.core.message.core.message.IMessage;
import com.knowledge.core.message.core.message.SendMessageRequest;
import com.knowledge.core.tool.api.R;

@FeignClient("knowledge-message")
public interface IMessageClient {

        @PostMapping("/client/sendMessage")
        public <T extends IMessage> R<?> sendMessage(@RequestBody SendMessageRequest<T> request);

        /**
         * Send WebSocket notification to a single user
         */
        @PostMapping("/client/notification/send")
        R<Boolean> sendWebSocketNotification(@RequestParam("userId") Long userId,
                        @RequestParam("type") String type,
                        @RequestBody Map<String, Object> data);

        /**
         * Send WebSocket notification to multiple users
         */
        @PostMapping("/client/notification/send-batch")
        R<Integer> sendBatchWebSocketNotification(@RequestParam("type") String type,
                        @RequestBody Map<String, Object> payload);

        /**
         * Send instant message (persisted to database and sent via WebSocket)
         *
         * @param senderId    Sender user ID
         * @param receiverId  Receiver user ID
         * @param content     Message content
         * @param contentType Content type (TEXT, INVITATION, etc.)
         * @param extraData   Extra data in JSON format (optional)
         * @return true if message was delivered via WebSocket
         */
        @PostMapping("/client/instant-message/send")
        R<Boolean> sendInstantMessage(@RequestParam("senderId") Long senderId,
                        @RequestParam("receiverId") Long receiverId,
                        @RequestParam("content") String content,
                        @RequestParam("contentType") String contentType,
                        @RequestBody Map<String, Object> extraData);

}
