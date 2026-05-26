package com.knowledge.message.controller;

import com.knowledge.core.tool.api.R;
import com.knowledge.message.application.MessageApplication;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * WebSocket Notification Controller
 * Provides REST API endpoints for sending WebSocket notifications
 */
@Slf4j
@RestController
@RequestMapping("/notification")
@Api(tags = "WebSocket Notification API")
@RequiredArgsConstructor
public class NotificationController {

    private final MessageApplication messageApplication;

    /**
     * Send WebSocket notification to a single user
     */
    @PostMapping("/send")
    @ApiOperation("Send WebSocket notification to user")
    public R<Boolean> sendNotification(@RequestParam("userId") Long userId,
            @RequestParam("type") String type,
            @RequestBody Map<String, Object> data) {
        boolean delivered = messageApplication.sendWebSocketNotification(userId, type, data);
        return R.data(delivered);
    }

    /**
     * Send WebSocket notification to multiple users
     */
    @PostMapping("/send-batch")
    @ApiOperation("Send WebSocket notification to multiple users")
    @SuppressWarnings("unchecked")
    public R<Integer> sendBatchNotification(@RequestParam("type") String type,
            @RequestBody Map<String, Object> payload) {
        List<Long> userIds = (List<Long>) payload.get("userIds");
        Map<String, Object> data = (Map<String, Object>) payload.get("data");

        int successCount = messageApplication.sendBatchWebSocketNotification(type, userIds, data);
        return R.data(successCount);
    }
}
