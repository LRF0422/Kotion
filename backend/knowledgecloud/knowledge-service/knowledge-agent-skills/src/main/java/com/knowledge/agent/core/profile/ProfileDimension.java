package com.knowledge.agent.core.profile;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Allowlisted user-profile dimensions. This is the single source of truth for
 * what MAY be derived from conversations — anything not listed here is dropped
 * by the extractor before it reaches storage.
 *
 * <p>Sensitive attributes (gender, mental state, personality, health,
 * politics, religion, sexual orientation, precise location, finance) are
 * deliberately absent and additionally blocked by {@link ProfileSensitivity}.
 */
public enum ProfileDimension {

    OCCUPATION("occupation", "职业", Temporal.STABLE, false),
    INDUSTRY("industry", "行业", Temporal.STABLE, false),
    EXPERTISE("expertise", "专业主题", Temporal.EVOLVING, true),
    TECH_STACK("tech_stack", "技术栈", Temporal.EVOLVING, true),
    CONTENT_TOPIC("content_topic", "内容兴趣", Temporal.EVOLVING, true),
    CONTENT_FORMAT("content_format", "内容形式偏好", Temporal.EVOLVING, true),
    INTERACTION_PREF("interaction_pref", "交互偏好", Temporal.EVOLVING, true),
    ACTIVE_HOURS("active_hours", "活跃时段", Temporal.EPHEMERAL, true);

    /** Confidence half-life by how fast the trait goes stale. */
    public enum Temporal {
        STABLE(180),
        EVOLVING(45),
        EPHEMERAL(14);

        private final int halfLifeDays;

        Temporal(int halfLifeDays) {
            this.halfLifeDays = halfLifeDays;
        }

        public int getHalfLifeDays() {
            return halfLifeDays;
        }
    }

    private final String key;
    private final String label;
    private final Temporal temporal;
    private final boolean multiValue;

    ProfileDimension(String key, String label, Temporal temporal, boolean multiValue) {
        this.key = key;
        this.label = label;
        this.temporal = temporal;
        this.multiValue = multiValue;
    }

    public String getKey() {
        return key;
    }

    public String getLabel() {
        return label;
    }

    public Temporal getTemporal() {
        return temporal;
    }

    public boolean isMultiValue() {
        return multiValue;
    }

    public int getHalfLifeDays() {
        return temporal.getHalfLifeDays();
    }

    private static final Map<String, ProfileDimension> BY_KEY;

    static {
        Map<String, ProfileDimension> map = new LinkedHashMap<>();
        for (ProfileDimension dimension : values()) {
            map.put(dimension.key, dimension);
        }
        BY_KEY = Collections.unmodifiableMap(map);
    }

    /** Null when the key is not allowlisted (never throws). */
    public static ProfileDimension fromKey(String key) {
        if (key == null) {
            return null;
        }
        return BY_KEY.get(key.trim().toLowerCase());
    }

    public static boolean isAllowlisted(String key) {
        return fromKey(key) != null;
    }

    public static Set<String> keys() {
        return Collections.unmodifiableSet(new LinkedHashSet<>(BY_KEY.keySet()));
    }

    public static String[] keyArray() {
        return Arrays.copyOf(BY_KEY.keySet().toArray(new String[0]), BY_KEY.size());
    }
}
