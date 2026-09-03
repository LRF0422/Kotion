package com.knowledge.filecenter.upload;

import lombok.Value;

@Value
public class UploadDestination {
    String repositoryKey;
    Long parentId;
}
