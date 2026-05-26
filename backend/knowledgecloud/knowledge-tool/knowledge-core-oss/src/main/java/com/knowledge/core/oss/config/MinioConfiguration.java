package com.knowledge.core.oss.config;

import com.knowledge.core.oss.MinioTemplate;
import com.knowledge.core.oss.props.OssProperties;
import com.knowledge.core.oss.rule.KnowledgeOssRule;
import com.knowledge.core.oss.rule.OssRule;
import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

@AutoConfiguration@EnableConfigurationProperties(OssProperties.class)
@ConditionalOnProperty(value = "oss.name", havingValue = "minio")
public class MinioConfiguration {

	@Autowired
	private OssProperties ossProperties;

	@Bean
	@ConditionalOnMissingBean(OssRule.class)
	public OssRule ossRule() {
		return new KnowledgeOssRule();
	}

	@Bean
	public MinioClient minioClient() {
		return MinioClient.builder()
			.endpoint(ossProperties.getEndpoint())
			.credentials(ossProperties.getAccessKey(), ossProperties.getSecretKey())
			.build();
	}

	@Bean
	public MinioTemplate minioTemplate() {
		return new MinioTemplate(ossProperties, ossRule(), minioClient());
	}


}
