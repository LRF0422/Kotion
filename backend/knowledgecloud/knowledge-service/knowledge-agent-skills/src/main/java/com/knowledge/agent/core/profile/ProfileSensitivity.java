package com.knowledge.agent.core.profile;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Hard privacy gate for extracted traits. The LLM is instructed not to emit
 * sensitive attributes, but its output is untrusted: every draft is re-checked
 * here before it can reach storage.
 *
 * <p>Bias is intentional — over-blocking a legitimate value is acceptable,
 * storing an inferred sensitive attribute is not. This is the last line of
 * defence required by the design spec (§2.1 / §6.4).
 */
public final class ProfileSensitivity {

    /** Substrings that mark a value/excerpt as sensitive. Lower-cased matching. */
    private static final List<String> BLOCKED_TOKENS = Collections.unmodifiableList(Arrays.asList(
            // gender / sex
            "性别", "男生", "女生", "男性", "女性", "男士", "女士", "男", "女",
            "gender", "male", "female", "woman", "man ",
            // age
            "年龄", "岁", "age ", "years old",
            // mental state / personality
            "抑郁", "焦虑", "情绪", "心情", "心理", "精神", "性格", "内向", "外向", "人格",
            "depress", "anxiety", "anxious", "mental", "personality", "introvert", "extrovert", "mbti",
            // health
            "健康", "疾病", "生病", "怀孕", "残疾", "health", "disease", "illness", "pregnan",
            // politics / religion
            "政治", "党派", "宗教", "信仰", "politics", "political", "religio",
            // sexual orientation / relationship
            "性取向", "同性", "恋爱", "婚姻", "sexual", "gay", "lesbian",
            // finance / location / identity
            "收入", "工资", "薪资", "负债", "住址", "家庭住址", "身份证",
            "income", "salary", "address", "id card"
    ));

    private ProfileSensitivity() {
    }

    /** True when the text carries (or hints at) a sensitive attribute. */
    public static boolean isBlocked(String text) {
        if (text == null || text.trim().isEmpty()) {
            return false;
        }
        String normalized = text.toLowerCase(Locale.ROOT);
        for (String token : BLOCKED_TOKENS) {
            if (normalized.contains(token)) {
                return true;
            }
        }
        return false;
    }

    /** A draft is storable only when dimension, value and evidence are all clean. */
    public static boolean isStorable(String dimension, String value, String evidence) {
        return ProfileDimension.isAllowlisted(dimension)
                && !isBlocked(value)
                && !isBlocked(evidence);
    }

    public static List<String> blockedTokens() {
        return BLOCKED_TOKENS;
    }
}
