-- ============================================================
-- Agent Harness - First-class sub-agent tasks (V6)
--
-- Adds the parent_task_id column to agent_task so a delegated
-- sub-agent run can be represented as a regular task with an
-- explicit parent linkage (status/events/snapshot/resume/cancel).
-- ============================================================

ALTER TABLE `agent_task`
    ADD COLUMN `parent_task_id` VARCHAR(64) DEFAULT NULL COMMENT 'Parent task id for delegated sub-agent runs',
    ADD KEY `idx_parent_task_id` (`parent_task_id`);
