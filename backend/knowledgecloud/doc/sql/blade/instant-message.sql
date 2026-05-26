-- ===============================
-- WebSocket Instant Message Table
-- ===============================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for knowledge_instant_message
-- ----------------------------
DROP TABLE IF EXISTS `knowledge_instant_message`;
CREATE TABLE `knowledge_instant_message` (
  `id` bigint(20) NOT NULL COMMENT 'Primary Key ID',
  `sender_id` bigint(20) NOT NULL COMMENT 'Sender User ID',
  `sender_name` varchar(100) DEFAULT NULL COMMENT 'Sender Name',
  `receiver_id` bigint(20) NOT NULL COMMENT 'Receiver User ID',
  `receiver_name` varchar(100) DEFAULT NULL COMMENT 'Receiver Name',
  `content` text NOT NULL COMMENT 'Message Content',
  `content_type` varchar(20) NOT NULL DEFAULT 'TEXT' COMMENT 'Content Type: TEXT, IMAGE, FILE, LINK, etc.',
  `status` varchar(20) NOT NULL DEFAULT 'SENT' COMMENT 'Message Status: SENT, DELIVERED, READ',
  `sent_time` datetime NOT NULL COMMENT 'Time When Message Was Sent',
  `delivered_time` datetime DEFAULT NULL COMMENT 'Time When Message Was Delivered',
  `read_time` datetime DEFAULT NULL COMMENT 'Time When Message Was Read',
  `conversation_id` varchar(50) NOT NULL COMMENT 'Conversation ID (format: min_userId_max_userId)',
  `reply_to_message_id` bigint(20) DEFAULT NULL COMMENT 'Reply To Message ID',
  `extra_data` json DEFAULT NULL COMMENT 'Extra Data in JSON Format',
  `tenant_id` varchar(12) DEFAULT NULL COMMENT 'Tenant ID',
  `create_user` bigint(20) DEFAULT NULL COMMENT 'Create User',
  `create_time` datetime DEFAULT NULL COMMENT 'Create Time',
  `update_user` bigint(20) DEFAULT NULL COMMENT 'Update User',
  `update_time` datetime DEFAULT NULL COMMENT 'Update Time',
  `is_deleted` int(2) DEFAULT 0 COMMENT 'Delete Flag (0: Not Deleted, 1: Deleted)',
  PRIMARY KEY (`id`),
  KEY `idx_sender_id` (`sender_id`),
  KEY `idx_receiver_id` (`receiver_id`),
  KEY `idx_conversation_id` (`conversation_id`),
  KEY `idx_status` (`status`),
  KEY `idx_sent_time` (`sent_time`),
  KEY `idx_receiver_status` (`receiver_id`, `status`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Instant Message Table';

-- ----------------------------
-- Example data (optional, for testing)
-- ----------------------------
-- INSERT INTO `knowledge_instant_message` 
-- (`id`, `sender_id`, `sender_name`, `receiver_id`, `receiver_name`, `content`, `content_type`, `status`, `sent_time`, `conversation_id`, `tenant_id`, `create_user`, `create_time`, `is_deleted`)
-- VALUES 
-- (1, 1, 'Admin', 2, 'User', 'Hello!', 'TEXT', 'SENT', NOW(), '1_2', '000000', 1, NOW(), 0);

SET FOREIGN_KEY_CHECKS = 1;
