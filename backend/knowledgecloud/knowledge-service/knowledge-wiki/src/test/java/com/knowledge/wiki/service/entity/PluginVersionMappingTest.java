package com.knowledge.wiki.service.entity;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;

import com.baomidou.mybatisplus.annotation.TableField;

/**
 * Persistence contract for the plugin icon fields.
 *
 * The version-icon feature shipped broken once: {@code PluginVersion.icon} was
 * declared {@code @TableField(exist = false)}, so every write was dropped and the
 * approval step (which reads the icon back out of the database) could never see
 * it. Mocked application tests cannot catch that — they keep the in-memory object
 * — so the contract is pinned here, where a wrong annotation fails immediately.
 *
 * The icon fields that must be columns: a version carries its own icon for review
 * and promotion, and the plugin keeps the four slots a submission fills.
 * The VO-only labels ({@code name}, {@code description}, …) stay transient.
 */
class PluginVersionMappingTest {

    private static boolean isPersisted(Class<?> type, String fieldName) throws Exception {
        Field field = type.getDeclaredField(fieldName);
        TableField annotation = field.getAnnotation(TableField.class);
        return annotation == null || annotation.exist();
    }

    @Test
    void versionIconIsAPersistedColumn() throws Exception {
        assertTrue(isPersisted(PluginVersion.class, "icon"),
                "PluginVersion.icon must be a real column: a display-only field silently drops "
                        + "the icon a version publishes, which makes 升版改图标 a no-op");
    }

    @Test
    void pluginIconSlotsArePersistedColumns() throws Exception {
        for (String field : new String[] { "icon", "iconMd", "iconLg", "iconXl" }) {
            assertTrue(isPersisted(Plugin.class, field), "Plugin." + field + " must be a real column");
        }
    }

    @Test
    void versionDisplayLabelsStayTransient() throws Exception {
        for (String field : new String[] { "name", "description", "developer", "maintainer", "pluginKey" }) {
            assertFalse(isPersisted(PluginVersion.class, field),
                    "PluginVersion." + field + " is filled for display only and must stay transient");
        }
    }
}
