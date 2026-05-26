# 会员系统使用说明

## 系统架构

本会员系统基于MyBatis Plus构建，采用分层架构设计：

- **数据库层**: 4个核心表（会员等级、用户会员关系、订阅订单、支付记录）
- **领域模型**: 完整的实体类和VO对象
- **数据访问层**: 基于MyBatis Plus的Mapper接口
- **服务层**: 会员等级、用户会员、订阅订单、支付记录服务
- **控制层**: REST API控制器和支付回调处理
- **权限系统**: Pro功能访问控制注解和拦截器

## 系统概述

本会员系统支持两种会员等级：
- **基础会员(BASIC)**: 免费，享受基本功能
- **专业会员(PRO)**: 付费，享受全部高级功能

支持月付(29.9元)和年付(299元)两种订阅方式，通过Ping++聚合支付平台实现微信扫码和支付宝扫码支付。

## 数据库初始化

执行SQL脚本初始化会员相关表：

```bash
# 执行会员系统数据库脚本
mysql -u username -p database_name < doc/sql/blade/membership-system.sql
```

## 配置说明

### 1. 添加依赖

在 `knowledge-service/knowledge-system/pom.xml` 中已添加必要依赖：

### 2. 配置文件

在 `application-dev.yml` 中配置Ping++参数：

```yaml
pingxx:
  # 测试环境API Key
  api-key: sk_test_YOUR_PINGXX_API_KEY_HERE
  # App ID
  app-id: app_1Gqj58ynP0mHeX1s
  # 私钥路径（可选）
  private-key-path: classpath:certs/pingpp_rsa_private_key.pem
  # 公钥路径（可选）
  public-key-path: classpath:certs/pingpp_rsa_public_key.pem
  # 回调通知地址
  notify-url: http://localhost:8106/payment/pingxx/callback
  # 是否为测试环境
  test-mode: true
```

## API接口说明

### 1. 会员等级相关

#### 获取会员等级列表
```
GET /membership/levels
```

响应示例：
```json
{
  "code": 200,
  "data": [
    {
      "id": 1,
      "levelCode": "BASIC",
      "levelName": "基础会员",
      "levelDesc": "免费的基础会员等级，享受基本功能",
      "priceMonthly": 0.00,
      "priceYearly": 0.00,
      "benefits": ["基础文档编辑", "个人知识库", "每日10次AI问答"],
      "sort": 1
    },
    {
      "id": 2,
      "levelCode": "PRO",
      "levelName": "专业会员",
      "levelDesc": "付费的专业会员等级，享受全部高级功能",
      "priceMonthly": 29.90,
      "priceYearly": 299.00,
      "benefits": ["无限制文档编辑", "团队协作", "无限制AI问答", "高级模板", "优先客服"],
      "sort": 2
    }
  ]
}
```

### 2. 用户会员信息

#### 获取当前用户会员信息
```
GET /membership/info
```

#### 检查Pro权限
```
GET /membership/check-pro
```

### 3. 订阅订单

#### 创建订阅订单
```
POST /membership/subscribe
参数：
- levelId: 会员等级ID
- subscriptionType: 订阅类型(MONTHLY/YEARLY)
- paymentMethod: 支付方式(WECHAT_QR/ALIPAY_QR)
```

#### 获取用户订单列表
```
GET /membership/orders
```

#### 取消订单
```
DELETE /membership/orders/{orderId}
```

### 4. 支付回调

#### Ping++支付回调
```
POST /payment/pingxx/callback
```

#### 查询支付状态
```
GET /payment/status/{orderNo}
```

## 权限控制使用

### 1. 方法级别权限控制

```java
@RestController
@RequestMapping("/api")
public class ExampleController {
    
    @GetMapping("/pro-feature")
    @RequireProMembership(message = "此功能需要Pro会员权限")
    public R<String> proFeature() {
        return R.data("Pro功能内容");
    }
}
```

### 2. 类级别权限控制

```java
@RestController
@RequestMapping("/api/pro")
@RequireProMembership(message = "此类所有接口都需要Pro会员权限")
public class ProController {
    
    @GetMapping("/feature1")
    public R<String> feature1() {
        return R.data("功能1");
    }
    
    @GetMapping("/feature2")
    public R<String> feature2() {
        return R.data("功能2");
    }
}
```

## 测试验证

### 1. 单元测试

运行会员服务测试：
```bash
cd knowledge-service/knowledge-system
mvn test -Dtest=MembershipServiceTest
```

### 2. 功能测试流程

1. **获取会员等级列表**
   ```bash
   curl http://localhost:8106/membership/levels
   ```

2. **查看当前用户会员信息**
   ```bash
   curl -H "Authorization: Bearer {token}" http://localhost:8106/membership/info
   ```

3. **创建Pro会员订阅订单**
   ```bash
   curl -X POST \
     -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     "http://localhost:8106/membership/subscribe?levelId=2&subscriptionType=MONTHLY&paymentMethod=WECHAT_QR"
   ```

4. **尝试访问Pro功能**
   ```bash
   curl -H "Authorization: Bearer {token}" http://localhost:8106/pro-feature/exclusive
   ```

## 部署注意事项

1. **生产环境配置**
   - 替换Ping++的测试API Key为生产环境Key
   - 更新回调地址为生产环境域名
   - 配置HTTPS证书

2. **安全考虑**
   - 确保私钥文件安全存储
   - 实现完整的签名验证机制
   - 添加订单防重放攻击机制

3. **监控告警**
   - 监控支付成功率
   - 监控会员到期提醒
   - 监控异常访问行为

## 常见问题

### 1. 支付回调验证失败
确保正确实现了签名验证逻辑，参考Ping++官方文档。

### 2. 权限拦截不生效
检查是否正确注册了ProMembershipInterceptor拦截器。

### 3. 数据库连接问题
确认数据库连接配置正确，相关表已创建。

## 后续优化建议

1. 添加会员到期提醒功能
2. 实现自动续费逻辑
3. 添加优惠券系统
4. 完善退款处理流程
5. 添加会员数据分析报表