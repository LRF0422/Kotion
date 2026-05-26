/*
 Navicat Premium Data Transfer

 Source Server         : mysql_localhost
 Source Server Type    : MySQL
 Source Server Version : 50729
 Source Host           : localhost:3306
 Source Schema         : knowledge

 Target Server Type    : MySQL
 Target Server Version : 50729
 File Encoding         : 65001

 Date: 04/02/2026 10:00:00
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for membership_level
-- ----------------------------
DROP TABLE IF EXISTS `membership_level`;
CREATE TABLE `membership_level`  (
  `id` bigint(20) NOT NULL COMMENT '主键',
  `level_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '等级编码',
  `level_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '等级名称',
  `level_desc` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '等级描述',
  `price_monthly` decimal(10, 2) NULL DEFAULT NULL COMMENT '月付价格',
  `price_yearly` decimal(10, 2) NULL DEFAULT NULL COMMENT '年付价格',
  `benefits` json NULL COMMENT '权益列表(JSON格式)',
  `sort` int(11) NULL DEFAULT 0 COMMENT '排序',
  `status` int(2) NOT NULL DEFAULT 1 COMMENT '状态(1:启用 0:禁用)',
  `create_user` bigint(20) NULL DEFAULT NULL COMMENT '创建人',
  `create_dept` bigint(20) NULL DEFAULT NULL COMMENT '创建部门',
  `create_time` datetime(0) NULL DEFAULT NULL COMMENT '创建时间',
  `update_user` bigint(20) NULL DEFAULT NULL COMMENT '修改人',
  `update_time` datetime(0) NULL DEFAULT NULL COMMENT '修改时间',
  `is_deleted` int(2) NOT NULL DEFAULT 0 COMMENT '是否已删除',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_level_code`(`level_code`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '会员等级表';

-- ----------------------------
-- Records of membership_level
-- ----------------------------
BEGIN;
INSERT INTO `membership_level` VALUES 
(1, 'BASIC', '基础会员', '免费的基础会员等级，享受基本功能', 0.00, 0.00, '[\"基础文档编辑\", \"个人知识库\", \"每日10次AI问答\"]', 1, 1, 1123598821738675201, 1123598813738675201, NOW(), 1123598821738675201, NOW(), 0),
(2, 'PRO', '专业会员', '付费的专业会员等级，享受全部高级功能', 29.90, 299.00, '[\"无限制文档编辑\", \"团队协作\", \"无限制AI问答\", \"高级模板\", \"优先客服\"]', 2, 1, 1123598821738675201, 1123598813738675201, NOW(), 1123598821738675201, NOW(), 0);
COMMIT;

-- ----------------------------
-- Table structure for user_membership
-- ----------------------------
DROP TABLE IF EXISTS `user_membership`;
CREATE TABLE `user_membership`  (
  `id` bigint(20) NOT NULL COMMENT '主键',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `level_id` bigint(20) NOT NULL COMMENT '会员等级ID',
  `level_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '等级编码',
  `start_time` datetime(0) NOT NULL COMMENT '会员开始时间',
  `end_time` datetime(0) NOT NULL COMMENT '会员结束时间',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否激活',
  `auto_renew` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否自动续费',
  `source_order_id` bigint(20) NULL DEFAULT NULL COMMENT '来源订单ID',
  `create_user` bigint(20) NULL DEFAULT NULL COMMENT '创建人',
  `create_dept` bigint(20) NULL DEFAULT NULL COMMENT '创建部门',
  `create_time` datetime(0) NULL DEFAULT NULL COMMENT '创建时间',
  `update_user` bigint(20) NULL DEFAULT NULL COMMENT '修改人',
  `update_time` datetime(0) NULL DEFAULT NULL COMMENT '修改时间',
  `is_deleted` int(2) NOT NULL DEFAULT 0 COMMENT '是否已删除',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_user_id`(`user_id`, `is_deleted`) USING BTREE,
  INDEX `idx_level_id`(`level_id`) USING BTREE,
  INDEX `idx_end_time`(`end_time`) USING BTREE,
  CONSTRAINT `fk_user_membership_user` FOREIGN KEY (`user_id`) REFERENCES `knowledge_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_membership_level` FOREIGN KEY (`level_id`) REFERENCES `membership_level` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '用户会员关系表';

-- ----------------------------
-- Table structure for subscription_order
-- ----------------------------
DROP TABLE IF EXISTS `subscription_order`;
CREATE TABLE `subscription_order`  (
  `id` bigint(20) NOT NULL COMMENT '主键',
  `order_no` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '订单号',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `level_id` bigint(20) NOT NULL COMMENT '会员等级ID',
  `level_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '等级编码',
  `subscription_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '订阅类型(MONTHLY:月付 YEARLY:年付)',
  `amount` decimal(10, 2) NOT NULL COMMENT '订单金额',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'PENDING' COMMENT '订单状态(PENDING:待支付 PAID:已支付 CANCELLED:已取消 EXPIRED:已过期)',
  `payment_method` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '支付方式(WECHAT_QR:微信扫码 ALIPAY_QR:支付宝扫码)',
  `qr_code_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '二维码URL',
  `payment_deadline` datetime(0) NULL DEFAULT NULL COMMENT '支付截止时间',
  `paid_time` datetime(0) NULL DEFAULT NULL COMMENT '支付完成时间',
  `effective_time` datetime(0) NULL DEFAULT NULL COMMENT '生效时间',
  `expiry_time` datetime(0) NULL DEFAULT NULL COMMENT '到期时间',
  `trade_no` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '第三方交易号',
  `create_user` bigint(20) NULL DEFAULT NULL COMMENT '创建人',
  `create_dept` bigint(20) NULL DEFAULT NULL COMMENT '创建部门',
  `create_time` datetime(0) NULL DEFAULT NULL COMMENT '创建时间',
  `update_user` bigint(20) NULL DEFAULT NULL COMMENT '修改人',
  `update_time` datetime(0) NULL DEFAULT NULL COMMENT '修改时间',
  `is_deleted` int(2) NOT NULL DEFAULT 0 COMMENT '是否已删除',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_order_no`(`order_no`, `is_deleted`) USING BTREE,
  INDEX `idx_user_id`(`user_id`) USING BTREE,
  INDEX `idx_status`(`status`) USING BTREE,
  INDEX `idx_create_time`(`create_time`) USING BTREE,
  CONSTRAINT `fk_subscription_order_user` FOREIGN KEY (`user_id`) REFERENCES `knowledge_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_subscription_order_level` FOREIGN KEY (`level_id`) REFERENCES `membership_level` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '订阅订单表';

-- ----------------------------
-- Table structure for payment_record
-- ----------------------------
DROP TABLE IF EXISTS `payment_record`;
CREATE TABLE `payment_record`  (
  `id` bigint(20) NOT NULL COMMENT '主键',
  `trade_no` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '第三方交易号',
  `order_id` bigint(20) NOT NULL COMMENT '订单ID',
  `order_no` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '订单号',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `amount` decimal(10, 2) NOT NULL COMMENT '支付金额',
  `payment_method` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '支付方式',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '支付状态(SUCCESS:成功 FAILED:失败 PROCESSING:处理中)',
  `paid_time` datetime(0) NULL DEFAULT NULL COMMENT '支付完成时间',
  `channel_trade_no` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '渠道交易号',
  `channel_data` json NULL COMMENT '渠道返回数据',
  `create_user` bigint(20) NULL DEFAULT NULL COMMENT '创建人',
  `create_dept` bigint(20) NULL DEFAULT NULL COMMENT '创建部门',
  `create_time` datetime(0) NULL DEFAULT NULL COMMENT '创建时间',
  `update_user` bigint(20) NULL DEFAULT NULL COMMENT '修改人',
  `update_time` datetime(0) NULL DEFAULT NULL COMMENT '修改时间',
  `is_deleted` int(2) NOT NULL DEFAULT 0 COMMENT '是否已删除',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_trade_no`(`trade_no`, `is_deleted`) USING BTREE,
  INDEX `idx_order_id`(`order_id`) USING BTREE,
  INDEX `idx_user_id`(`user_id`) USING BTREE,
  INDEX `idx_paid_time`(`paid_time`) USING BTREE,
  CONSTRAINT `fk_payment_record_order` FOREIGN KEY (`order_id`) REFERENCES `subscription_order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payment_record_user` FOREIGN KEY (`user_id`) REFERENCES `knowledge_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '支付记录表';

SET FOREIGN_KEY_CHECKS = 1;