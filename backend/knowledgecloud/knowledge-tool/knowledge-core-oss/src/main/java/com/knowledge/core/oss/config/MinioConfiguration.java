package com.knowledge.core.oss.config;

import com.knowledge.core.oss.MinioTemplate;
import com.knowledge.core.oss.multipart.MinioS3MultipartUploadClient;
import com.knowledge.core.oss.multipart.MultipartUploadClient;
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
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

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

	@Bean(destroyMethod = "close")
	public S3Client minioS3Client() {
		return S3Client.builder()
				.endpointOverride(URI.create(ossProperties.getEndpoint()))
				.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(
						ossProperties.getAccessKey(), ossProperties.getSecretKey())))
				.region(Region.US_EAST_1)
				.serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
				.httpClientBuilder(UrlConnectionHttpClient.builder())
				.build();
	}

	@Bean(destroyMethod = "close")
	public S3Presigner minioS3Presigner() {
		return S3Presigner.builder()
				.endpointOverride(URI.create(browserEndpoint()))
				.credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(
						ossProperties.getAccessKey(), ossProperties.getSecretKey())))
				.region(Region.US_EAST_1)
				.serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
				.build();
	}

	@Bean
	public MultipartUploadClient multipartUploadClient(S3Client minioS3Client, S3Presigner minioS3Presigner) {
		return new MinioS3MultipartUploadClient(minioS3Client, minioS3Presigner);
	}

	@Bean
	public MinioTemplate minioTemplate() {
		return new MinioTemplate(ossProperties, ossRule(), minioClient());
	}

	private String browserEndpoint() {
		String publicEndpoint = ossProperties.getPublicEndpoint();
		return publicEndpoint == null || publicEndpoint.trim().isEmpty()
				? ossProperties.getEndpoint() : publicEndpoint;
	}

}
