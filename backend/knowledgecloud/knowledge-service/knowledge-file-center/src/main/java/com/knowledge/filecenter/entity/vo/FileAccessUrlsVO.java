package com.knowledge.filecenter.entity.vo;

import java.time.Instant;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class FileAccessUrlsVO {
    String previewUrl;
    String downloadUrl;
    Instant expiresAt;
}
