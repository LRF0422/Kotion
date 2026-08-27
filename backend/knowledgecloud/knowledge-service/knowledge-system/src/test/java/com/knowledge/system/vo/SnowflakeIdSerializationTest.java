package com.knowledge.system.vo;

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.system.domain.vo.RoleVO;

class SnowflakeIdSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void serializesUserAndRoleIdsAsStrings() throws Exception {
        long snowflakeId = 1123598821738675201L;
        UserVO user = new UserVO();
        user.setId(snowflakeId);
        RoleVO role = new RoleVO();
        role.setId(snowflakeId);
        role.setParentId(snowflakeId - 1);

        String userJson = objectMapper.writeValueAsString(user);
        String roleJson = objectMapper.writeValueAsString(role);

        assertTrue(userJson.contains("\"id\":\"1123598821738675201\""));
        assertTrue(roleJson.contains("\"id\":\"1123598821738675201\""));
        assertTrue(roleJson.contains("\"parentId\":\"1123598821738675200\""));
    }
}
