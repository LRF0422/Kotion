package com.knowledge.wiki.service.entity;

import java.io.Serializable;

import cn.hutool.json.JSONObject;
import lombok.Data;

@Data
public class Mark implements Serializable {

    private String type;
    private JSONObject attrs;
}
