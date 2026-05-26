package com.knowledge.core.message.core.message;

import java.util.HashMap;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SendMessageResult {

    /**
     * 0 全部成功 1 存在部失败
     */
    private Integer result;
    private Map<Long, String> resultDetails = new HashMap<>();

    public static SendMessageResult success() {
        SendMessageResult result = new SendMessageResult();
        result.setResult(0);
        return result;
    }

}
