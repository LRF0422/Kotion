# Collaboration Invitation API Documentation

This document describes the backend APIs required for the collaboration invitation feature.

## Overview

The collaboration feature allows users to:
- Invite other users to collaborate on a page
- Manage collaborator permissions
- Send email invitations
- Generate shareable links
- Receive real-time notifications in message center

---

## Complete Invitation Flow

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Inviter    │      │   Frontend   │      │   Backend    │      │   Invitee    │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │                     │
       │  1. Click Invite    │                     │                     │
       │────────────────────>│                     │                     │
       │                     │                     │                     │
       │                     │ 2. POST /invitation │                     │
       │                     │────────────────────>│                     │
       │                     │                     │                     │
       │                     │                     │ 3. Send WebSocket   │
       │                     │                     │    Notification     │
       │                     │                     │────────────────────>│
       │                     │                     │                     │
       │                     │ 4. Success Response │                     │
       │                     │<────────────────────│                     │
       │                     │                     │                     │
       │  5. Toast: Sent     │                     │ 6. MessageBox shows │
       │<────────────────────│                     │    notification     │
       │                     │                     │                     │
       │                     │                     │  7. Click message   │
       │                     │                     │<────────────────────│
       │                     │                     │                     │
       │                     │                     │ 8. Navigate to      │
       │                     │                     │    /collaborate/:token
       │                     │                     │────────────────────>│
       │                     │                     │                     │
       │                     │                     │ 9. Validate & Accept│
       │                     │                     │<────────────────────│
       │                     │                     │                     │
       │                     │                     │ 10. Load Page       │
       │                     │                     │────────────────────>│
       │                     │                     │                     │
       │                     │                     │ 11. Load Inviter's  │
       │                     │                     │     Plugins         │
       │                     │                     │────────────────────>│
       │                     │                     │                     │
       │                     │                     │ 12. Show Editor     │
       │                     │                     │     with Inviter's  │
       │                     │                     │     Extensions      │
       │                     │                     │────────────────────>│
       │                     │                     │                     │
```

---

## API Endpoints

### 1. Search Users

Search for users to invite to collaborate.

**Endpoint:** `GET /knowledge-system/user/search`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| keyword | string | Yes | Search keyword (name or email) |
| pageSize | number | No | Number of results per page (default: 10) |

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "records": [
      {
        "id": "user-uuid-1",
        "name": "John Doe",
        "username": "johndoe",
        "nickName": "John",
        "email": "john@example.com",
        "avatar": "https://example.com/avatar/john.png"
      }
    ],
    "total": 1,
    "pageSize": 10,
    "current": 1
  }
}
```

---

### 2. Get Space Members

Get list of members in a space.

**Endpoint:** `GET /knowledge-wiki/space/:id/members`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Space ID |

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "user-uuid-1",
      "name": "John Doe",
      "email": "john@example.com",
      "avatar": "https://example.com/avatar/john.png",
      "role": "OWNER",
      "joinedAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "user-uuid-2",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "avatar": "https://example.com/avatar/jane.png",
      "role": "MEMBER",
      "joinedAt": "2024-01-20T14:00:00Z"
    }
  ]
}
```

---

### 3. Create Collaboration Invitation

Send collaboration invitations to users or emails.

**Endpoint:** `POST /knowledge-wiki/space/collaborationInvitation`

**Request Body:**

```json
{
  "spaceId": "space-uuid",
  "pageId": "page-uuid",
  "collaboratorIds": ["user-uuid-1", "user-uuid-2"],
  "collaboratorEmails": ["external@example.com"],
  "permissions": ["WRITE"]
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| spaceId | string | Yes | ID of the space |
| pageId | string | Yes | ID of the page |
| collaboratorIds | string[] | No | Array of user IDs to invite (existing users) |
| collaboratorEmails | string[] | No | Array of email addresses to invite (external users) |
| permissions | string[] | Yes | Permission levels: `READ`, `WRITE`, or `ADMIN` |

**Permission Levels:**
- `READ` - Can only view the page
- `WRITE` - Can view and edit the page
- `ADMIN` - Full access including managing collaborators

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "invitationId": "invitation-uuid",
    "invitationToken": "abc123xyz",
    "collaborateUrl": "/collaborate/abc123xyz",
    "successCount": 3,
    "failedEmails": [],
    "createdAt": "2024-01-25T10:30:00Z"
  }
}
```

**Note:** The backend automatically sends WebSocket notifications to all invited users. See [Message Center Integration](#message-center-integration) for details.

---

### 4. Get Page Collaborators

Get list of current collaborators on a page.

**Endpoint:** `GET /knowledge-wiki/space/page/:pageId/collaborators`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| pageId | string | Yes | Page ID |

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "user-uuid-1",
      "name": "John Doe",
      "username": "johndoe",
      "email": "john@example.com",
      "avatar": "https://example.com/avatar/john.png",
      "permission": "ADMIN",
      "invitedAt": "2024-01-15T10:30:00Z",
      "invitedBy": {
        "id": "owner-uuid",
        "name": "Owner Name"
      }
    },
    {
      "id": "user-uuid-2",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "avatar": null,
      "permission": "WRITE",
      "invitedAt": "2024-01-20T14:00:00Z",
      "invitedBy": {
        "id": "user-uuid-1",
        "name": "John Doe"
      }
    }
  ]
}
```

---

### 5. Update Collaborator Permission

Update the permission level of an existing collaborator.

**Endpoint:** `PUT /knowledge-wiki/space/page/:pageId/collaborator/:userId/permission`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| pageId | string | Yes | Page ID |
| userId | string | Yes | User ID of the collaborator |

**Request Body:**

```json
{
  "permission": "WRITE"
}
```

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "userId": "user-uuid-2",
    "pageId": "page-uuid",
    "permission": "WRITE",
    "updatedAt": "2024-01-25T11:00:00Z"
  }
}
```

---

### 6. Remove Page Collaborator

Remove a collaborator from a page.

**Endpoint:** `DELETE /knowledge-wiki/space/page/:pageId/collaborator/:userId`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| pageId | string | Yes | Page ID |
| userId | string | Yes | User ID of the collaborator to remove |

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "removed": true,
    "userId": "user-uuid-2",
    "pageId": "page-uuid"
  }
}
```

---

### 7. Generate Share Link

Generate a shareable link for the page.

**Endpoint:** `POST /knowledge-wiki/space/page/:pageId/share-link`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| pageId | string | Yes | Page ID |

**Request Body:**

```json
{
  "isPublic": false,
  "expiresIn": 7,
  "permission": "READ"
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| isPublic | boolean | No | If true, anyone with link can access (default: false) |
| expiresIn | number | No | Link expiration in days (default: null = never expires) |
| permission | string | No | Default permission for link access: `READ` or `WRITE` |

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "link": "https://app.example.com/share/abc123xyz",
    "shortCode": "abc123xyz",
    "expiresAt": "2024-02-01T10:30:00Z",
    "isPublic": false,
    "permission": "READ",
    "createdAt": "2024-01-25T10:30:00Z"
  }
}
```

---

## Database Schema Suggestions

### collaboration_invitation Table

```sql
CREATE TABLE collaboration_invitation (
    id VARCHAR(36) PRIMARY KEY,
    space_id VARCHAR(36) NOT NULL,
    page_id VARCHAR(36) NOT NULL,
    inviter_id VARCHAR(36) NOT NULL,
    invitee_id VARCHAR(36),
    invitee_email VARCHAR(255),
    permission VARCHAR(20) NOT NULL DEFAULT 'READ',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    expires_at TIMESTAMP,
    
    CONSTRAINT fk_space FOREIGN KEY (space_id) REFERENCES space(id),
    CONSTRAINT fk_page FOREIGN KEY (page_id) REFERENCES page(id),
    CONSTRAINT fk_inviter FOREIGN KEY (inviter_id) REFERENCES user(id),
    CONSTRAINT fk_invitee FOREIGN KEY (invitee_id) REFERENCES user(id)
);
```

### page_collaborator Table

```sql
CREATE TABLE page_collaborator (
    id VARCHAR(36) PRIMARY KEY,
    page_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    permission VARCHAR(20) NOT NULL DEFAULT 'READ',
    invited_by VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_page_user (page_id, user_id),
    CONSTRAINT fk_collab_page FOREIGN KEY (page_id) REFERENCES page(id),
    CONSTRAINT fk_collab_user FOREIGN KEY (user_id) REFERENCES user(id),
    CONSTRAINT fk_collab_inviter FOREIGN KEY (invited_by) REFERENCES user(id)
);
```

### share_link Table

```sql
CREATE TABLE share_link (
    id VARCHAR(36) PRIMARY KEY,
    page_id VARCHAR(36) NOT NULL,
    short_code VARCHAR(20) NOT NULL UNIQUE,
    created_by VARCHAR(36) NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    permission VARCHAR(20) DEFAULT 'READ',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_share_page FOREIGN KEY (page_id) REFERENCES page(id),
    CONSTRAINT fk_share_creator FOREIGN KEY (created_by) REFERENCES user(id)
);
```

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | BAD_REQUEST | Invalid request parameters |
| 401 | UNAUTHORIZED | User not authenticated |
| 403 | FORBIDDEN | User doesn't have permission |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | User already a collaborator |
| 429 | TOO_MANY_REQUESTS | Rate limit exceeded |

---

## Email Notification Template

When inviting via email, the system should send an email notification:

**Subject:** `{inviter_name} invited you to collaborate on "{page_title}"`

**Content:**
```
Hi,

{inviter_name} has invited you to collaborate on the page "{page_title}" 
in the "{space_name}" space.

Permission level: {permission_label}

Click here to accept the invitation:
{invitation_link}

This invitation will expire on {expiration_date}.

---
Knowledge Repo Team
```

---

## WebSocket Events (Optional)

For real-time notifications, consider implementing these WebSocket events:

| Event | Payload | Description |
|-------|---------|-------------|
| `collaboration.invited` | `{pageId, inviterId, permission}` | New invitation received |
| `collaboration.accepted` | `{pageId, userId}` | Invitation accepted |
| `collaboration.removed` | `{pageId, userId}` | Collaborator removed |
| `collaboration.permission_changed` | `{pageId, userId, permission}` | Permission updated |

---

## Message Center Integration

When an invitation is created, the backend MUST send a real-time notification to the invitee via WebSocket.

### WebSocket Notification Message Format

When sending the invitation notification, use the following message format:

**WebSocket Message (Server → Client):**

```json
{
  "code": 200,
  "success": true,
  "data": {
    "type": "NEW_MESSAGE",
    "data": {
      "id": 12345,
      "senderId": 1001,
      "senderName": "John Doe",
      "receiverId": 1002,
      "receiverName": "Jane Smith",
      "content": "John Doe invited you to collaborate on \"Project Documentation\". Click to join: /collaborate/abc123xyz",
      "contentType": "LINK",
      "status": "SENT",
      "sentTime": "2024-01-25T10:30:00Z"
    },
    "timestamp": 1706177400000
  }
}
```

### Message Content Format

The message content MUST follow this format for the frontend to parse the collaboration link:

```
{inviter_name} invited you to collaborate on "{page_title}". Click to join: /collaborate/{invitation_token}
```

**Important:** The `/collaborate/{token}` path in the content is parsed by the frontend to enable direct navigation when the user clicks the message.

### Backend Implementation Requirements

When `POST /knowledge-wiki/space/collaborationInvitation` is called:

1. **Create invitation record** in database
2. **Generate unique invitation token** (UUID recommended)
3. **Send WebSocket notification** to each invitee with the message format above
4. **Send email notification** (optional, for external email invitations)
5. **Return success response** to inviter

---

## Invitation Acceptance Flow APIs

These APIs are used when a user clicks an invitation link and lands on the collaboration page.

### 8. Validate Invitation Token

Validate an invitation token before accepting.

**Endpoint:** `GET /knowledge-wiki/collaboration/invitation/:token/validate`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | Invitation token from the invitation link |

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "invitation-uuid",
    "pageId": "page-uuid",
    "spaceId": "space-uuid",
    "pageTitle": "Project Documentation",
    "spaceName": "Engineering Team",
    "inviterName": "John Doe",
    "inviterId": "inviter-user-uuid",
    "permission": "WRITE",
    "expiresAt": "2024-02-01T10:30:00Z",
    "status": "PENDING"
  }
}
```

**Status Values:**
- `PENDING` - Invitation not yet accepted
- `ACCEPTED` - Invitation already accepted
- `EXPIRED` - Invitation has expired
- `REVOKED` - Invitation was revoked by inviter

---

### 9. Accept Invitation

Accept an invitation to collaborate on a page.

**Endpoint:** `POST /knowledge-wiki/collaboration/invitation/:token/accept`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | Invitation token |

**Request Headers:**
- `Authorization: Bearer {user_token}` - User must be authenticated

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "success": true,
    "pageId": "page-uuid",
    "spaceId": "space-uuid",
    "permission": "WRITE",
    "acceptedAt": "2024-01-25T10:30:00Z"
  }
}
```

**Error Responses:**

| Code | Message | Description |
|------|---------|-------------|
| 400 | INVALID_TOKEN | Token is invalid or malformed |
| 401 | UNAUTHORIZED | User not authenticated |
| 404 | INVITATION_NOT_FOUND | Invitation does not exist |
| 410 | INVITATION_EXPIRED | Invitation has expired |
| 409 | ALREADY_ACCEPTED | Invitation was already accepted |

---

### 10. Get Invitation Page Content

Get the page content for an accepted invitation.

**Endpoint:** `GET /knowledge-wiki/collaboration/invitation/:token/page`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | Invitation token |

**Request Headers:**
- `Authorization: Bearer {user_token}` - User must be authenticated

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": "page-uuid",
    "title": "Project Documentation",
    "icon": "📄",
    "content": "{\"type\":\"doc\",\"content\":[...]}",
    "spaceId": "space-uuid",
    "spaceName": "Engineering Team",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-25T10:30:00Z"
  }
}
```

**Note:** This endpoint returns page content only if the user has a valid accepted invitation for this page.

---

### 11. Get Inviter's Installed Plugins

Get the list of plugins installed by the collaboration inviter. This allows the invited user to load the same editor extensions as the inviter, ensuring a consistent editing experience.

**Endpoint:** `GET /knowledge-wiki/collaboration/invitation/:token/plugins`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | Invitation token |

**Request Headers:**
- `Authorization: Bearer {user_token}` - User must be authenticated

**Response:**

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "id": "plugin-uuid-1",
      "name": "AI Assistant",
      "pluginKey": "@kn/plugin-ai",
      "resourcePath": "https://cdn.example.com/plugins/plugin-ai/1.0.0/index.umd.js",
      "version": "1.0.0",
      "description": "AI-powered writing assistant"
    },
    {
      "id": "plugin-uuid-2",
      "name": "Database",
      "pluginKey": "@kn/plugin-database",
      "resourcePath": "https://cdn.example.com/plugins/plugin-database/1.2.0/index.umd.js",
      "version": "1.2.0",
      "description": "Database tables and views"
    },
    {
      "id": "plugin-uuid-3",
      "name": "Mermaid Diagrams",
      "pluginKey": "@kn/plugin-mermaid",
      "resourcePath": "https://cdn.example.com/plugins/plugin-mermaid/1.0.5/index.umd.js",
      "version": "1.0.5",
      "description": "Create diagrams using Mermaid syntax"
    }
  ]
}
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier of the installed plugin |
| name | string | Display name of the plugin |
| pluginKey | string | Unique plugin package key (used for loading the script) |
| resourcePath | string | URL to the plugin's UMD bundle file |
| version | string | Installed version of the plugin |
| description | string | Brief description of the plugin |

**Important Notes:**

1. **Purpose**: This API returns the inviter's installed plugins so the invited user's editor can load the same extensions, ensuring both users see the same editor features (e.g., custom blocks, formatting options, diagrams).

2. **Plugin Loading**: The frontend will dynamically load each plugin from the `resourcePath` using the `pluginKey` as the window scope identifier.

3. **Fallback**: If this API fails or returns an empty list, the frontend will fall back to the invited user's own installed plugins.

4. **Backend Logic**: The backend should:
   - Validate the invitation token
   - Get the inviter's user ID from the invitation record
   - Return the list of plugins installed by the inviter (from `user_installed_plugin` table or similar)

**Error Responses:**

| Code | Message | Description |
|------|---------|-------------|
| 400 | INVALID_TOKEN | Token is invalid or malformed |
| 401 | UNAUTHORIZED | User not authenticated |
| 404 | INVITATION_NOT_FOUND | Invitation does not exist |

---

## Frontend Routes

| Route | Description |
|-------|-------------|
| `/collaborate/:token` | Collaboration editor page for invited users |

**Example URL:** `https://app.example.com/collaborate/abc123xyz`

---

## Invitation Flow Sequence

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  User   │     │ Frontend│     │ Backend │     │   DB    │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ Click link    │               │               │
     │──────────────>│               │               │
     │               │               │               │
     │               │ GET /validate │               │
     │               │──────────────>│               │
     │               │               │ Check token   │
     │               │               │──────────────>│
     │               │               │<──────────────│
     │               │<──────────────│               │
     │               │               │               │
     │               │ POST /accept  │               │
     │               │──────────────>│               │
     │               │               │ Update status │
     │               │               │──────────────>│
     │               │               │<──────────────│
     │               │<──────────────│               │
     │               │               │               │
     │               │ GET /page     │               │
     │               │──────────────>│               │
     │               │               │ Get content   │
     │               │               │──────────────>│
     │               │               │<──────────────│
     │               │<──────────────│               │
     │               │               │               │
     │               │ GET /plugins  │               │
     │               │──────────────>│               │
     │               │               │ Get inviter's │
     │               │               │ plugins       │
     │               │               │──────────────>│
     │               │               │<──────────────│
     │               │<──────────────│               │
     │               │               │               │
     │               │ Load plugin   │               │
     │               │ scripts       │               │
     │               │──────────────>│               │
     │               │               │               │
     │ Show editor   │               │               │
     │ with inviter's│               │               │
     │ plugins       │               │               │
     │<──────────────│               │               │
     │               │               │               │
```
