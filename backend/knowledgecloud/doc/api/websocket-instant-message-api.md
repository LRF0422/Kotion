# WebSocket 即时消息 API 文档

## 概述

本文档描述了即时消息功能的 WebSocket 和 REST API 接口，支持实时消息通信、离线消息推送、消息已读状态等功能。

---

## 零、网关配置 (Gateway)

### 0.1 Nacos 配置

在 Nacos 中添加以下配置到 `knowledge-gateway-dev.yaml`：

```yaml
spring:
  cloud:
    gateway:
      routes:
        # WebSocket 路由
        - id: knowledge-message-websocket
          uri: lb:ws://knowledge-message
          predicates:
            - Path=/ws/message/**
          filters:
            - StripPrefix=0
        
        # Message 服务 HTTP 路由
        - id: knowledge-message
          uri: lb://knowledge-message
          predicates:
            - Path=/knowledge-message/**
          filters:
            - StripPrefix=1
```

### 0.2 连接方式

| 方式 | 地址 | 说明 |
|------|------|------|
| 通过网关 | `ws://{gateway}:88/ws/message?token=xxx` | 推荐，统一入口 |
| 直连服务 | `ws://{host}:7770/ws/message?token=xxx` | 开发调试使用 |

---

## 一、WebSocket 连接

### 1.1 连接地址

```
ws://{host}:7770/ws/message?token={JWT_TOKEN}
```

| 参数 | 说明 |
|------|------|
| host | 服务器地址 |
| token | 用户登录后获取的 JWT Token |

### 1.2 连接示例

```javascript
// JavaScript 示例
const token = 'your_jwt_token_here';
const ws = new WebSocket(`ws://localhost:7770/ws/message?token=${token}`);

ws.onopen = function() {
    console.log('WebSocket 连接成功');
};

ws.onmessage = function(event) {
    const response = JSON.parse(event.data);
    console.log('收到消息:', response);
};

ws.onclose = function(event) {
    console.log('WebSocket 连接关闭', event.code, event.reason);
};

ws.onerror = function(error) {
    console.error('WebSocket 错误:', error);
};
```

### 1.3 连接成功响应

连接成功后，服务器会自动推送：
1. 连接成功确认
2. 离线消息列表（如有）
3. 未读消息数量

---

## 二、WebSocket 消息类型

### 2.1 消息格式

**发送消息格式：**
```json
{
    "type": "消息类型",
    "其他字段": "..."
}
```

**接收消息格式：**
```json
{
    "code": 200,
    "success": true,
    "data": {
        "type": "消息类型",
        "data": "消息内容",
        "timestamp": 1737280800000
    },
    "msg": "操作成功"
}
```

### 2.2 客户端发送的消息类型

#### 2.2.1 发送消息 (SEND)

```json
{
    "type": "SEND",
    "receiverId": 123,
    "content": "你好！",
    "contentType": "TEXT"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | String | 是 | 固定值 "SEND" |
| receiverId | Long | 是 | 接收者用户 ID |
| content | String | 是 | 消息内容 |
| contentType | String | 否 | 内容类型：TEXT(默认)、IMAGE、FILE、LINK |

#### 2.2.2 标记消息已读 (READ)

```json
{
    "type": "READ",
    "messageId": 456
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | String | 是 | 固定值 "READ" |
| messageId | Long | 是 | 要标记为已读的消息 ID |

#### 2.2.3 标记所有消息已读 (READ_ALL)

```json
{
    "type": "READ_ALL",
    "senderId": 123
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | String | 是 | 固定值 "READ_ALL" |
| senderId | Long | 否 | 发送者 ID，不传则标记所有消息为已读 |

#### 2.2.4 心跳检测 (PING)

```json
{
    "type": "PING"
}
```

#### 2.2.5 获取未读数量 (GET_UNREAD_COUNT)

```json
{
    "type": "GET_UNREAD_COUNT"
}
```

### 2.3 服务端推送的消息类型

#### 2.3.1 新消息通知 (NEW_MESSAGE)

```json
{
    "code": 200,
    "success": true,
    "data": {
        "type": "NEW_MESSAGE",
        "data": {
            "id": 789,
            "senderId": 123,
            "senderName": "张三",
            "receiverId": 456,
            "receiverName": "李四",
            "content": "你好！",
            "contentType": "TEXT",
            "status": "SENT",
            "sentTime": "2026-01-19T10:30:00",
            "conversationId": "123_456"
        },
        "timestamp": 1737280800000
    }
}
```

#### 2.3.2 消息发送确认 (MESSAGE_SENT)

```json
{
    "code": 200,
    "success": true,
    "data": {
        "type": "MESSAGE_SENT",
        "data": {
            "id": 789,
            "senderId": 456,
            "receiverId": 123,
            "content": "收到！",
            "status": "SENT",
            "sentTime": "2026-01-19T10:31:00"
        },
        "timestamp": 1737280860000
    }
}
```

#### 2.3.3 消息已读通知 (MESSAGE_READ)

当对方阅读了你发送的消息时，会收到此通知：

```json
{
    "code": 200,
    "success": true,
    "data": {
        "type": "MESSAGE_READ",
        "data": 789,
        "timestamp": 1737280900000
    }
}
```

#### 2.3.4 离线消息列表 (OFFLINE_MESSAGES)

连接成功后自动推送：

```json
{
    "code": 200,
    "success": true,
    "data": {
        "type": "OFFLINE_MESSAGES",
        "data": [
            {
                "id": 787,
                "senderId": 123,
                "senderName": "张三",
                "content": "在吗？",
                "sentTime": "2026-01-19T09:00:00"
            },
            {
                "id": 788,
                "senderId": 123,
                "senderName": "张三",
                "content": "有事找你",
                "sentTime": "2026-01-19T09:01:00"
            }
        ],
        "timestamp": 1737280800000
    }
}
```

#### 2.3.5 未读消息数量 (UNREAD_COUNT)

```json
{
    "code": 200,
    "success": true,
    "data": {
        "type": "UNREAD_COUNT",
        "data": 5,
        "timestamp": 1737280800000
    }
}
```

#### 2.3.6 心跳响应 (PONG)

```json
{
    "code": 200,
    "success": true,
    "data": {
        "type": "PONG",
        "data": "pong",
        "timestamp": 1737280800000
    }
}
```

#### 2.3.7 错误消息 (ERROR)

```json
{
    "code": 400,
    "success": false,
    "msg": "receiverId and content are required"
}
```

---

## 三、REST API 接口

基础路径：`/instant-message`

### 3.1 发送消息

**POST** `/instant-message/send`

**请求头：**
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**请求体：**
```json
{
    "receiverId": 123,
    "content": "你好！",
    "contentType": "TEXT",
    "replyToMessageId": null,
    "extraData": null
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| receiverId | Long | 是 | 接收者用户 ID |
| content | String | 是 | 消息内容 |
| contentType | String | 否 | TEXT(默认)、IMAGE、FILE、LINK |
| replyToMessageId | Long | 否 | 回复的消息 ID |
| extraData | String | 否 | 扩展数据（JSON 字符串） |

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": {
        "id": 789,
        "senderId": 456,
        "senderName": "李四",
        "receiverId": 123,
        "receiverName": "张三",
        "content": "你好！",
        "contentType": "TEXT",
        "status": "SENT",
        "sentTime": "2026-01-19T10:30:00",
        "conversationId": "123_456"
    },
    "msg": "操作成功"
}
```

### 3.2 获取会话消息列表

**GET** `/instant-message/conversation/{userId}?pageNum=1&pageSize=20`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | Long | 是 | 对方用户 ID（路径参数） |
| pageNum | Integer | 否 | 页码，默认 1 |
| pageSize | Integer | 否 | 每页数量，默认 20 |

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": {
        "records": [
            {
                "id": 789,
                "senderId": 456,
                "senderName": "李四",
                "receiverId": 123,
                "receiverName": "张三",
                "content": "你好！",
                "contentType": "TEXT",
                "status": "READ",
                "sentTime": "2026-01-19T10:30:00",
                "readTime": "2026-01-19T10:31:00"
            }
        ],
        "total": 100,
        "size": 20,
        "current": 1,
        "pages": 5
    }
}
```

### 3.3 获取会话列表

**GET** `/instant-message/conversations`

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": [
        {
            "conversationId": "123_456",
            "userId": 123,
            "userName": "张三",
            "userAvatar": null,
            "lastMessageContent": "你好！",
            "lastMessageContentType": "TEXT",
            "lastMessageTime": "2026-01-19T10:30:00",
            "unreadCount": 2,
            "isOnline": true
        }
    ]
}
```

### 3.4 获取未读消息数量

**GET** `/instant-message/unread-count`

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": 5
}
```

### 3.5 获取未读消息列表

**GET** `/instant-message/unread`

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": [
        {
            "id": 787,
            "senderId": 123,
            "senderName": "张三",
            "content": "在吗？",
            "status": "DELIVERED",
            "sentTime": "2026-01-19T09:00:00"
        }
    ]
}
```

### 3.6 标记消息已读

**POST** `/instant-message/read`

**请求体（以下字段任选其一）：**
```json
{
    "messageId": 789,
    "messageIds": [787, 788, 789],
    "senderId": 123,
    "conversationId": "123_456"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| messageId | Long | 单个消息 ID |
| messageIds | List&lt;Long&gt; | 多个消息 ID |
| senderId | Long | 标记该发送者的所有消息为已读 |
| conversationId | String | 标记该会话的所有消息为已读 |

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": true
}
```

### 3.7 标记所有消息已读

**POST** `/instant-message/read-all`

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": 10
}
```

### 3.8 删除消息

**DELETE** `/instant-message/{messageId}`

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": true
}
```

### 3.9 清空会话记录

**DELETE** `/instant-message/conversation/{userId}`

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": 50
}
```

### 3.10 获取在线用户列表

**GET** `/instant-message/online-users`

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": [123, 456, 789]
}
```

### 3.11 检查用户是否在线

**GET** `/instant-message/online/{userId}`

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": true
}
```

### 3.12 获取在线用户数量

**GET** `/instant-message/online-count`

**响应：**
```json
{
    "code": 200,
    "success": true,
    "data": 128
}
```

---

## 四、消息状态说明

| 状态 | 说明 |
|------|------|
| SENT | 已发送（消息已存储到服务器） |
| DELIVERED | 已送达（消息已推送到接收者客户端） |
| READ | 已读（接收者已查看消息） |

---

## 五、内容类型说明

| 类型 | 说明 |
|------|------|
| TEXT | 文本消息 |
| IMAGE | 图片消息（content 存储图片 URL） |
| FILE | 文件消息（content 存储文件 URL） |
| LINK | 链接消息（content 存储链接 URL） |

---

## 六、前端集成示例

### 6.1 Vue 3 集成示例

```javascript
// useWebSocket.js
import { ref, onMounted, onUnmounted } from 'vue';

export function useWebSocket(token) {
    const ws = ref(null);
    const messages = ref([]);
    const unreadCount = ref(0);
    const isConnected = ref(false);

    const connect = () => {
        ws.value = new WebSocket(`ws://localhost:7770/ws/message?token=${token}`);

        ws.value.onopen = () => {
            isConnected.value = true;
            console.log('WebSocket 已连接');
        };

        ws.value.onmessage = (event) => {
            const response = JSON.parse(event.data);
            if (response.success && response.data) {
                handleMessage(response.data);
            }
        };

        ws.value.onclose = () => {
            isConnected.value = false;
            // 自动重连
            setTimeout(connect, 3000);
        };
    };

    const handleMessage = (wsMessage) => {
        switch (wsMessage.type) {
            case 'NEW_MESSAGE':
                messages.value.push(wsMessage.data);
                unreadCount.value++;
                break;
            case 'OFFLINE_MESSAGES':
                messages.value = [...wsMessage.data, ...messages.value];
                break;
            case 'UNREAD_COUNT':
                unreadCount.value = wsMessage.data;
                break;
            case 'MESSAGE_READ':
                // 更新消息状态
                const msg = messages.value.find(m => m.id === wsMessage.data);
                if (msg) msg.status = 'READ';
                break;
        }
    };

    const sendMessage = (receiverId, content, contentType = 'TEXT') => {
        if (ws.value && isConnected.value) {
            ws.value.send(JSON.stringify({
                type: 'SEND',
                receiverId,
                content,
                contentType
            }));
        }
    };

    const markAsRead = (messageId) => {
        if (ws.value && isConnected.value) {
            ws.value.send(JSON.stringify({
                type: 'READ',
                messageId
            }));
        }
    };

    // 心跳保活
    const heartbeat = setInterval(() => {
        if (ws.value && isConnected.value) {
            ws.value.send(JSON.stringify({ type: 'PING' }));
        }
    }, 30000);

    onMounted(connect);

    onUnmounted(() => {
        clearInterval(heartbeat);
        if (ws.value) ws.value.close();
    });

    return {
        messages,
        unreadCount,
        isConnected,
        sendMessage,
        markAsRead
    };
}
```

### 6.2 React 集成示例

```javascript
// useWebSocket.js
import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(token) {
    const ws = useRef(null);
    const [messages, setMessages] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isConnected, setIsConnected] = useState(false);

    const handleMessage = useCallback((wsMessage) => {
        switch (wsMessage.type) {
            case 'NEW_MESSAGE':
                setMessages(prev => [...prev, wsMessage.data]);
                setUnreadCount(prev => prev + 1);
                break;
            case 'OFFLINE_MESSAGES':
                setMessages(prev => [...wsMessage.data, ...prev]);
                break;
            case 'UNREAD_COUNT':
                setUnreadCount(wsMessage.data);
                break;
        }
    }, []);

    useEffect(() => {
        ws.current = new WebSocket(`ws://localhost:7770/ws/message?token=${token}`);

        ws.current.onopen = () => setIsConnected(true);
        ws.current.onclose = () => setIsConnected(false);
        ws.current.onmessage = (event) => {
            const response = JSON.parse(event.data);
            if (response.success && response.data) {
                handleMessage(response.data);
            }
        };

        // 心跳
        const heartbeat = setInterval(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: 'PING' }));
            }
        }, 30000);

        return () => {
            clearInterval(heartbeat);
            ws.current?.close();
        };
    }, [token, handleMessage]);

    const sendMessage = (receiverId, content) => {
        ws.current?.send(JSON.stringify({
            type: 'SEND',
            receiverId,
            content,
            contentType: 'TEXT'
        }));
    };

    const markAsRead = (messageId) => {
        ws.current?.send(JSON.stringify({
            type: 'READ',
            messageId
        }));
    };

    return { messages, unreadCount, isConnected, sendMessage, markAsRead };
}
```

---

## 七、注意事项

1. **Token 有效性**：WebSocket 连接需要有效的 JWT Token，Token 过期后连接会断开
2. **重连机制**：建议前端实现自动重连机制，断开后 3-5 秒后重试
3. **心跳保活**：建议每 30 秒发送一次 PING 消息保持连接
4. **消息顺序**：消息按 `sentTime` 排序，分页查询时按时间倒序返回
5. **多设备支持**：同一用户可以同时在多个设备登录，消息会推送到所有设备

---

## 八、错误码说明

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权（Token 无效或过期） |
| 403 | 禁止访问 |
| 500 | 服务器内部错误 |
