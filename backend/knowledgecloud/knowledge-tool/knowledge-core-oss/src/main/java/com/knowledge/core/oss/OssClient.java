package com.knowledge.core.oss;

import com.knowledge.core.oss.model.KnowledgeFile;
import com.knowledge.core.oss.model.OssFile;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.util.List;

public interface OssClient {

	void makeBucket(String bucketName);

	void removeBucket(String bucketName);

	boolean bucketExists(String bucketName);

	void copyFile(String bucketName, String fileName, String destBucketName);

	void copyFile(String bucketName, String fileName, String destBucketName, String destFileName);

	OssFile statFile(String fileName);

	String filePath(String fileName);

	String fileLink(String fileName);

	KnowledgeFile putFile(MultipartFile file);


	KnowledgeFile putFile(String fileName, MultipartFile file);


	KnowledgeFile putFile(String bucketName, String fileName, MultipartFile file);

	KnowledgeFile putFile(String bucketName, String fileName, InputStream stream);

	void removeFile(String fileName);

	void removeFile(String bucketName, String fileName);

	void removeFiles(List<String> fileNames);

	void removeFiles(String bucketName, List<String> fileNames);

	InputStream downloadFile(String fileName);

	InputStream downloadFile(String fileName, String bucket);

	List<KnowledgeFile> getFiles(String bucket);
}
