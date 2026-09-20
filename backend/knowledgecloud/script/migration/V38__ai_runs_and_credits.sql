-- ============================================================
-- V38: AI entitlement 口径从「每日 token」改为「每日次数 + 月度积分」
--
-- token 对用户不可理解，且一次长上下文/多步 Agent 就能打满；改为：
--   * ai.runs.daily      每日次数（一次用户消息触发的完整 run 计一次）
--   * ai.credits.monthly 月度积分（按模型单价 × token 折算，含缓存折扣）
-- 旧的 ai.tokens.daily 定义停用、方案取值删除（保留定义行便于审计）。
-- ============================================================

UPDATE subscription_entitlement SET status = 0 WHERE ent_code = 'ai.tokens.daily';
DELETE FROM subscription_plan_entitlement WHERE ent_code = 'ai.tokens.daily';

INSERT IGNORE INTO subscription_entitlement
    (id, ent_code, ent_name, category, value_type, unit, description, sort, status, is_deleted)
VALUES
    (17, 'ai.runs.daily', 'AI 每日次数', 'QUOTA', 'NUMBER', '次/天', '每日 AI 对话/任务次数（一次完整 run 计一次）', 17, 1, 0),
    (18, 'ai.credits.monthly', 'AI 月度积分', 'QUOTA', 'NUMBER', '积分/月', '每月 AI 积分（按模型单价×token 折算，含缓存折扣）', 18, 1, 0);

INSERT IGNORE INTO subscription_plan_entitlement (id, plan_code, ent_code, bool_value, num_value, is_deleted) VALUES
    (117, 'FREE', 'ai.runs.daily', NULL, 30, 0),
    (118, 'FREE', 'ai.credits.monthly', NULL, 1000, 0),
    (217, 'PRO', 'ai.runs.daily', NULL, 300, 0),
    (218, 'PRO', 'ai.credits.monthly', NULL, 20000, 0),
    (317, 'PRO_PLUS', 'ai.runs.daily', NULL, 1000, 0),
    (318, 'PRO_PLUS', 'ai.credits.monthly', NULL, 100000, 0);
