package com.knowledge.core.oss;

import com.knowledge.core.oss.model.KnowledgeFile;
import com.knowledge.core.oss.model.OssFile;
import com.knowledge.core.oss.props.OssProperties;
import com.knowledge.core.oss.rule.OssRule;
import com.knowledge.core.tool.utils.DateUtil;
import com.knowledge.core.tool.utils.StringPool;
import io.minio.*;
import io.minio.messages.DeleteObject;
import io.minio.messages.Item;
import lombok.AllArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@AllArgsConstructor
public class MinioTemplate implements OssClient {

	private OssProperties ossProperties;
	private OssRule ossRule;
	private MinioClient minioClient;

	@Override
	@SneakyThrows
	public void makeBucket(String bucketName) {
		MakeBucketArgs makeBucketArgs = MakeBucketArgs
				.builder().bucket(bucketName).build();
		minioClient.makeBucket(makeBucketArgs);
	}

	@Override
	@SneakyThrows
	public void removeBucket(String bucketName) {
		RemoveBucketArgs removeBucketArgs = RemoveBucketArgs
				.builder().bucket(bucketName).build();
		minioClient.removeBucket(removeBucketArgs);
	}

	@Override
	@SneakyThrows
	public boolean bucketExists(String bucketName) {
		BucketExistsArgs bucketExistsArgs = BucketExistsArgs.builder()
				.bucket(bucketName).build();
		return minioClient.bucketExists(bucketExistsArgs);
	}

	@Override
	@SneakyThrows
	public void copyFile(String bucketName, String fileName, String destBucketName) {
		CopyObjectArgs copyObjectArgs = CopyObjectArgs.builder()
				.bucket(destBucketName)
				.object(fileName)
				.source(CopySource.builder().bucket(bucketName).object(fileName).build())
				.build();
		minioClient.copyObject(copyObjectArgs);
	}

	@Override
	@SneakyThrows
	public void copyFile(String bucketName, String fileName, String destBucketName, String destFileName) {
		CopyObjectArgs copyObjectArgs = CopyObjectArgs.builder()
				.bucket(destBucketName)
				.object(fileName)
				.source(CopySource.builder().bucket(destBucketName).object(destFileName).build())
				.build();
		minioClient.copyObject(copyObjectArgs);
	}

	@Override
	@SneakyThrows
	public OssFile statFile(String fileName) {
		StatObjectArgs statObjectArgs = StatObjectArgs.builder()
				.object(fileName)
				.bucket(ossProperties.getBucketName())
				.build();
		StatObjectResponse response = minioClient.statObject(statObjectArgs);
		OssFile ossFile = new OssFile();
		ossFile.setName(response.object());
		ossFile.setLink(fileLink(ossFile.getName()));
		ossFile.setLength(response.size());
		ossFile.setPutTime(DateUtil.toDate(response.lastModified().toLocalDate()));
		ossFile.setContentType(response.contentType());
		return ossFile;
	}

	@Override
	public String filePath(String fileName) {
		return ossProperties.getBucketName().concat(StringPool.SLASH).concat(fileName);
	}

	@Override
	public String fileLink(String fileName) {
		String endpoint = ossProperties.getEndpoint();
		if (endpoint == null) {
			return null;
		}
		if (endpoint.endsWith(StringPool.SLASH)) {
			endpoint = endpoint.substring(0, endpoint.length() - 1);
		}
		return endpoint + StringPool.SLASH + ossProperties.getBucketName() + StringPool.SLASH + fileName;
	}

	@Override
	@SneakyThrows
	public KnowledgeFile putFile(MultipartFile file) {
		return putFile(file.getOriginalFilename(), file);
	}

	@Override
	public KnowledgeFile putFile(String fileName, MultipartFile file) {
		return putFile(ossProperties.getBucketName(), fileName, file);
	}

	@Override
	@SneakyThrows
	public KnowledgeFile putFile(String bucketName, String fileName, MultipartFile file) {
		return putFile(bucketName, fileName, file.getInputStream());
	}

	@Override
	@SneakyThrows
	public KnowledgeFile putFile(String bucketName, String fileName, InputStream stream) {
		KnowledgeFile knowledgeFile = new KnowledgeFile();
		knowledgeFile.setOriginalName(fileName);
		knowledgeFile.setName(ossRule.fileName(fileName));
		knowledgeFile.setSize(stream.available());
		PutObjectArgs putObjectArgs = PutObjectArgs.builder()
				.object(knowledgeFile.getName())
				.stream(stream, stream.available(), -1)
				.bucket(bucketName).build();
		ObjectWriteResponse res = minioClient.putObject(putObjectArgs);
		knowledgeFile.setMd5Code(res.versionId());
		knowledgeFile.setLink(fileLink(knowledgeFile.getName()));
		return knowledgeFile;
	}

	@Override
	public void removeFile(String fileName) {
		removeFile(ossProperties.getBucketName(), fileName);
	}

	@Override
	@SneakyThrows
	public void removeFile(String bucketName, String fileName) {
		RemoveObjectArgs removeObjectArgs = RemoveObjectArgs.builder()
				.object(fileName)
				.bucket(bucketName)
				.build();
		minioClient.removeObject(removeObjectArgs);
	}

	@Override
	public void removeFiles(List<String> fileNames) {
		removeFiles(ossProperties.getBucketName(), fileNames);
	}

	@Override
	public void removeFiles(String bucketName, List<String> fileNames) {
		RemoveObjectsArgs removeObjectsArgs = RemoveObjectsArgs.builder()
				.objects(fileNames.stream().map(DeleteObject::new).collect(Collectors.toList()))
				.bucket(bucketName).build();
		minioClient.removeObjects(removeObjectsArgs);
	}

	@Override
	@SneakyThrows
	public InputStream downloadFile(String fileName) {
		GetObjectArgs getObjectArgs = GetObjectArgs.builder()
				.object(fileName)
				.bucket(ossProperties.getBucketName())
				.build();
		return minioClient.getObject(getObjectArgs);
	}

	@Override
	@SneakyThrows
	public InputStream downloadFile(String fileName, String bucket) {
		GetObjectArgs getObjectArgs = GetObjectArgs.builder()
				.object(fileName)
				.bucket(bucket)
				.build();
		return minioClient.getObject(getObjectArgs);
	}

	@Override
	public List<KnowledgeFile> getFiles(String bucket) {
		ListObjectsArgs args = ListObjectsArgs.builder()
				.bucket(bucket)
				.recursive(true)
				.build();
		Iterable<Result<Item>> results = minioClient.listObjects(args);
		List<KnowledgeFile> fileList = new ArrayList<>();
		if (results != null) {
			results.forEach(it -> {
				try {
					Item item = it.get();
					KnowledgeFile knowledgeFile = new KnowledgeFile();
					knowledgeFile.setName(item.objectName());
					knowledgeFile.setLink(item.objectName());
					fileList.add(knowledgeFile);
				} catch (Exception e) {
					// ignore
				}
			});
		}
		return fileList;
	}
}
