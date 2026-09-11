package com.knowledge.agent.core.savedskill;

import com.knowledge.agent.api.dto.ChatMessage;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Fail-closed consent check for persisting the current conversation as a skill.
 * A model tool call is not treated as user consent on its own.
 */
@Component
public class ExplicitSkillSaveIntentPolicy {

    private static final Pattern ENGLISH_ACTION = Pattern.compile(
            "\\b(save|create|persist|learn|convert|summari[sz]e|turn|make|update|upgrade|improve|refine)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ENGLISH_SKILL = Pattern.compile(
            "\\b(skill|skills|reusable workflow|workflow template|playbook)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ENGLISH_SOURCE = Pattern.compile(
            "\\b(this|it|current|existing|previous|before|conversation|chat|above|what we did|workflow|process|steps|work)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern ENGLISH_NEGATION = Pattern.compile(
            "\\b(do not|don't|dont|never|no need to)\\s+(?:save|create|persist|learn|convert|summari[sz]e|turn|make)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CHINESE_ACTION = Pattern.compile(
            "保存|存为|存成|提炼|总结|沉淀|创建|生成|转成|转换成|做成|记为|学习为|更新|升级|改进|完善|优化");
    private static final Pattern CHINESE_SKILL = Pattern.compile(
            "skill|技能|可复用流程|工作流模板|流程模板|操作手册", Pattern.CASE_INSENSITIVE);
    private static final Pattern CHINESE_SOURCE = Pattern.compile(
            "当前|这次|这个|这段|上述|上面|刚才|上次|本次|之前|原来|那个|它|会话|对话|流程|步骤|操作|做法|过程");
    private static final Pattern CHINESE_NEGATION = Pattern.compile(
            "(?:不要|别|不用|无需|不需要|禁止).{0,8}(?:保存|存为|存成|提炼|总结|沉淀|创建|生成|转成|转换成|做成|记为|学习为|更新|升级|改进|完善|优化)");

    public boolean isExplicit(List<ChatMessage> messages) {
        return isExplicitMessage(latestUserMessage(messages));
    }

    public boolean isExplicitMessage(String message) {
        if (message == null || message.trim().isEmpty()) {
            return false;
        }
        String normalized = message.trim().toLowerCase(Locale.ROOT);
        if (ENGLISH_NEGATION.matcher(normalized).find() || CHINESE_NEGATION.matcher(message).find()) {
            return false;
        }
        boolean action = ENGLISH_ACTION.matcher(normalized).find() || CHINESE_ACTION.matcher(message).find();
        boolean skill = ENGLISH_SKILL.matcher(normalized).find() || CHINESE_SKILL.matcher(message).find();
        boolean source = ENGLISH_SOURCE.matcher(normalized).find() || CHINESE_SOURCE.matcher(message).find();
        return action && skill && source;
    }

    public String latestUserMessage(List<ChatMessage> messages) {
        if (messages == null) {
            return null;
        }
        for (int i = messages.size() - 1; i >= 0; i--) {
            ChatMessage message = messages.get(i);
            if (message != null && "user".equalsIgnoreCase(message.getRole())
                    && message.getContent() != null && !message.getContent().trim().isEmpty()) {
                return message.getContent().trim();
            }
        }
        return null;
    }

}
