# 块 CRUD 操作使用指南

## 概述

本文档介绍了如何使用新增的块 CRUD 功能，包括查询块信息和更新块内容。

## API 接口说明

### 1. 查询块基本信息

**接口**: `GET /knowledge-wiki/space/page/block?id={blockId}`

**功能**: 根据块ID查询块的基本信息

**响应示例**:
```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": "block-uuid-123",
    "pageId": 123456,
    "type": "paragraph",
    "content": [...],
    "pageTitle": "示例页面",
    "spaceName": "示例空间"
  }
}
```

### 2. 查询块详细信息

**接口**: `GET /knowledge-wiki/space/page/block/detail/{blockId}`

**功能**: 获取块的详细信息，包括上下文和父子关系

**响应示例**:
```json
{
  "code": 200,
  "success": true,
  "data": {
    "id": "block-uuid-123",
    "type": "paragraph",
    "text": "这是块的文本内容",
    "attrs": {"id": "block-uuid-123"},
    "parentId": "parent-block-id",
    "pageId": 123456,
    "pageTitle": "示例页面",
    "spaceId": 789,
    "path": "0.1.2",
    "fullPath": "123456/0.1.2",
    "createTime": "2026-03-04T10:00:00",
    "updateTime": "2026-03-04T10:00:00"
  }
}
```

### 3. 更新块内容

**接口**: `PUT /knowledge-wiki/space/page/block/{blockId}`

**功能**: 更新指定块的内容

**请求参数**:
```json
{
  "pageId": 123456,
  "content": {
    "type": "paragraph",
    "content": [
      {
        "type": "text",
        "text": "更新后的文本内容"
      }
    ]
  },
  "text": "更新后的文本内容",
  "type": "paragraph",
  "partialUpdate": true
}
```

**注意事项**:
- `pageId` 必须提供
- `content` 是完整的块内容结构
- `partialUpdate` 为 true 时会自动发布新版本

## 使用示例

### JavaScript/TypeScript 前端调用示例

```typescript
// 查询块信息
async function getBlockInfo(blockId: string) {
  const response = await fetch(`/knowledge-wiki/space/page/block/detail/${blockId}`);
  const result = await response.json();
  return result.data;
}

// 更新块内容
async function updateBlock(blockId: string, updateData: any) {
  const response = await fetch(`/knowledge-wiki/space/page/block/${blockId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updateData)
  });
  return response.json();
}

// 使用示例
const blockId = 'your-block-id';
const blockInfo = await getBlockInfo(blockId);
console.log('块信息:', blockInfo);

// 更新块内容
const updateResult = await updateBlock(blockId, {
  pageId: blockInfo.pageId,
  content: {
    type: 'paragraph',
    content: [{
      type: 'text',
      text: '新的内容'
    }]
  },
  text: '新的内容',
  type: 'paragraph',
  partialUpdate: true
});
```

## 性能优化特性

### 1. 多层缓存机制
- Redis 缓存层：减少数据库查询
- 内存缓存：加速热点数据访问
- 智能缓存失效：数据更新时自动清除相关缓存

### 2. 数据库索引优化
- 块ID索引：快速定位块
- 路径索引：支持路径导航
- 复合索引：优化复杂查询

### 3. 增量更新策略
- 只更新变化的部分
- 保持文档结构完整性
- 自动生成新版本

## 错误处理

常见错误码：
- `400`: 参数错误
- `404`: 块或页面不存在
- `500`: 服务器内部错误

错误响应格式：
```json
{
  "code": 404,
  "success": false,
  "msg": "未找到指定的块"
}
```

## 最佳实践

1. **批量操作**: 对于多个块的更新，建议使用批量接口
2. **缓存利用**: 优先使用详细信息接口，充分利用缓存
3. **版本控制**: 合理使用 `partialUpdate` 参数控制版本发布
4. **错误重试**: 网络异常时实现适当的重试机制
5. **数据验证**: 前端提交前验证数据格式的正确性

## 注意事项

- 块更新会创建新的页面版本
- 删除块需要通过页面内容更新实现
- 路径信息在块移动时会自动更新
- 大文档的深层查询可能影响性能