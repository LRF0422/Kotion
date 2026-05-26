package com.knowledge.core.message.core.message;

import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import lombok.Data;

@Data
public abstract class AbstractMessage implements IMessage {

    private String title;
    private JSONObject params = JSONUtil.createObj();
    private String body;
    private String topic;
    private String type;
    private String description;
    private String url;

}
