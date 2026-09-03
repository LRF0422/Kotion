package com.knowledge.filecenter.upload;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.knowledge.core.oss.multipart.MultipartUploadClient;
import com.knowledge.core.oss.props.OssProperties;

@Configuration
public class UploadStorageConfiguration {

    @Bean
    @ConditionalOnExpression("'${oss.name:minio}' != 'minio'")
    @ConditionalOnMissingBean(MultipartUploadClient.class)
    public MultipartUploadClient unsupportedMultipartUploadClient(OssProperties properties) {
        return new UnsupportedMultipartUploadClient(properties.getName());
    }
}
