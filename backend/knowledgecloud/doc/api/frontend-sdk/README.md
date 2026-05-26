# 前端 SDK 快速接入指南

## 文件结构

```
frontend-sdk/
├── instant-message.ts      # 核心 TypeScript SDK (通用)
├── vue/
│   └── useInstantMessage.ts   # Vue 3 Composable
└── react/
    └── useInstantMessage.ts   # React Hook
```

---

## 一、安装依赖

无需额外依赖，直接复制 SDK 文件到项目中即可。

---

## 二、Vue 3 快速接入

### 2.1 复制文件

将以下文件复制到项目的 `src/composables/` 目录：
- `instant-message.ts`
- `vue/useInstantMessage.ts`

### 2.2 初始化 (App.vue 或 main.ts)

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useInstantMessage } from '@/composables/useInstantMessage';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();
const { init, destroy, unreadCount } = useInstantMessage();

onMounted(() => {
  if (userStore.token) {
    init(userStore.token);
  }
});

onUnmounted(() => {
  destroy();
});
</script>
```

### 2.3 会话列表组件

```vue
<template>
  <div class="conversation-list">
    <div 
      v-for="conv in conversations" 
      :key="conv.conversationId"
      class="conversation-item"
      @click="openChat(conv.userId)"
    >
      <div class="avatar">
        <img :src="conv.userAvatar || defaultAvatar" />
        <span v-if="conv.isOnline" class="online-badge"></span>
      </div>
      <div class="info">
        <div class="name">{{ conv.userName }}</div>
        <div class="last-message">{{ conv.lastMessageContent }}</div>
      </div>
      <div class="meta">
        <div class="time">{{ formatTime(conv.lastMessageTime) }}</div>
        <div v-if="conv.unreadCount > 0" class="unread">{{ conv.unreadCount }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useInstantMessage } from '@/composables/useInstantMessage';
import { useRouter } from 'vue-router';

const router = useRouter();
const { conversations, loadConversations } = useInstantMessage();
const defaultAvatar = '/default-avatar.png';

onMounted(() => {
  loadConversations();
});

const openChat = (userId: number) => {
  router.push(`/chat/${userId}`);
};

const formatTime = (time: string) => {
  return new Date(time).toLocaleString();
};
</script>
```

### 2.4 聊天组件

```vue
<template>
  <div class="chat-container">
    <!-- 消息列表 -->
    <div class="message-list" ref="messageListRef">
      <div 
        v-for="msg in messages" 
        :key="msg.id"
        :class="['message', msg.senderId === currentUserId ? 'sent' : 'received']"
      >
        <div class="content">{{ msg.content }}</div>
        <div class="meta">
          <span class="time">{{ formatTime(msg.sentTime) }}</span>
          <span v-if="msg.senderId === currentUserId" class="status">
            {{ msg.status === 'READ' ? '已读' : msg.status === 'DELIVERED' ? '已送达' : '已发送' }}
          </span>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <input 
        v-model="inputText" 
        @keyup.enter="send"
        placeholder="输入消息..."
      />
      <button @click="send">发送</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue';
import { useChat } from '@/composables/useInstantMessage';
import { useUserStore } from '@/stores/user';

const props = defineProps<{ userId: number }>();

const userStore = useUserStore();
const currentUserId = userStore.user.id;

const { messages, sendMessage, markAsRead, loadMore } = useChat(props.userId);

const inputText = ref('');
const messageListRef = ref<HTMLElement | null>(null);

const send = () => {
  if (!inputText.value.trim()) return;
  sendMessage(inputText.value);
  inputText.value = '';
};

// 滚动到底部
watch(messages, () => {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
});

// 标记消息已读
watch(messages, (newMessages) => {
  newMessages.forEach(msg => {
    if (msg.receiverId === currentUserId && msg.status !== 'READ') {
      markAsRead(msg.id);
    }
  });
}, { immediate: true });

const formatTime = (time: string) => {
  return new Date(time).toLocaleTimeString();
};
</script>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.message {
  max-width: 70%;
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 8px;
}

.message.sent {
  margin-left: auto;
  background: #1890ff;
  color: white;
}

.message.received {
  background: #f0f0f0;
}

.input-area {
  display: flex;
  padding: 12px;
  border-top: 1px solid #eee;
}

.input-area input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.input-area button {
  margin-left: 8px;
  padding: 8px 16px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>
```

---

## 三、React 快速接入

### 3.1 复制文件

将以下文件复制到项目的 `src/hooks/` 目录：
- `instant-message.ts`
- `react/useInstantMessage.ts`

### 3.2 消息上下文 Provider

```tsx
// src/contexts/MessageContext.tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { useInstantMessage } from '@/hooks/useInstantMessage';

const MessageContext = createContext<ReturnType<typeof useInstantMessage> | null>(null);

export function MessageProvider({ children, token }: { children: ReactNode; token: string }) {
  const value = useInstantMessage(token);
  return (
    <MessageContext.Provider value={value}>
      {children}
    </MessageContext.Provider>
  );
}

export function useMessage() {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessage must be used within MessageProvider');
  }
  return context;
}
```

### 3.3 在 App 中使用 Provider

```tsx
// src/App.tsx
import { MessageProvider } from '@/contexts/MessageContext';
import { useAuth } from '@/hooks/useAuth';

function App() {
  const { token } = useAuth();

  return (
    <MessageProvider token={token}>
      <Router>
        {/* ... routes */}
      </Router>
    </MessageProvider>
  );
}
```

### 3.4 会话列表组件

```tsx
// src/components/ConversationList.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMessage } from '@/contexts/MessageContext';

export function ConversationList() {
  const navigate = useNavigate();
  const { conversations, loadConversations, loading } = useMessage();

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="conversation-list">
      {conversations.map(conv => (
        <div 
          key={conv.conversationId}
          className="conversation-item"
          onClick={() => navigate(`/chat/${conv.userId}`)}
        >
          <img src={conv.userAvatar || '/default-avatar.png'} alt="" />
          <div className="info">
            <div className="name">{conv.userName}</div>
            <div className="last-message">{conv.lastMessageContent}</div>
          </div>
          {conv.unreadCount > 0 && (
            <span className="unread-badge">{conv.unreadCount}</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 3.5 聊天组件

```tsx
// src/components/Chat.tsx
import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useChat } from '@/hooks/useInstantMessage';
import { useAuth } from '@/hooks/useAuth';

export function Chat() {
  const { userId } = useParams<{ userId: string }>();
  const { token, user } = useAuth();
  const { messages, sendMessage, markAsRead, loading } = useChat(
    token, 
    user.id, 
    Number(userId)
  );

  const [inputText, setInputText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // 标记已读
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.receiverId === user.id && msg.status !== 'READ') {
        markAsRead(msg.id);
      }
    });
  }, [messages, user.id, markAsRead]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    sendMessage(inputText);
    setInputText('');
  };

  return (
    <div className="chat-container">
      <div className="message-list" ref={listRef}>
        {messages.map(msg => (
          <div 
            key={msg.id}
            className={`message ${msg.senderId === user.id ? 'sent' : 'received'}`}
          >
            <div className="content">{msg.content}</div>
            <div className="meta">
              <span className="time">
                {new Date(msg.sentTime).toLocaleTimeString()}
              </span>
              {msg.senderId === user.id && (
                <span className="status">
                  {msg.status === 'READ' ? '已读' : 
                   msg.status === 'DELIVERED' ? '已送达' : '已发送'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="input-area">
        <input
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyUp={e => e.key === 'Enter' && handleSend()}
          placeholder="输入消息..."
        />
        <button onClick={handleSend}>发送</button>
      </div>
    </div>
  );
}
```

---

## 四、未读消息角标

### Vue 3

```vue
<template>
  <div class="header">
    <router-link to="/messages" class="message-icon">
      <Icon name="message" />
      <span v-if="unreadCount > 0" class="badge">{{ unreadCount }}</span>
    </router-link>
  </div>
</template>

<script setup>
import { useInstantMessage } from '@/composables/useInstantMessage';
const { unreadCount } = useInstantMessage();
</script>
```

### React

```tsx
import { useMessage } from '@/contexts/MessageContext';

function Header() {
  const { unreadCount } = useMessage();

  return (
    <header>
      <Link to="/messages" className="message-icon">
        <MessageIcon />
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </Link>
    </header>
  );
}
```

---

## 五、配置说明

### 环境变量

**Vue (Vite):**
```env
# .env
VITE_API_BASE_URL=http://localhost:7770
```

**React (CRA):**
```env
# .env
REACT_APP_API_BASE_URL=http://localhost:7770
```

---

## 六、注意事项

1. **Token 管理**: 确保在用户登录后调用 `init(token)`，登出时调用 `destroy()`
2. **Token 刷新**: 如果 Token 刷新，需要重新调用 `init(newToken)`
3. **错误处理**: 注意处理 WebSocket 断开重连的情况
4. **性能优化**: 对于大量消息，建议使用虚拟列表
5. **图片/文件消息**: `contentType` 为 IMAGE/FILE 时，`content` 字段存储的是 URL
