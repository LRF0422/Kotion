/**
 * Copyright (c) 2018-2028, Chill Zhuang 庄骞 (smallchill@163.com).
 * <p>
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.apache.org/licenses/LICENSE-2.0
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.knowledge.resource.endpoint;

import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.oss.OssClient;
import com.knowledge.core.oss.model.KnowledgeFile;
import com.knowledge.core.oss.props.OssProperties;
import com.knowledge.core.tool.utils.IoUtil;
import com.knowledge.core.tool.utils.StringUtil;
import com.knowledge.resource.endpoint.dto.PluginFileUpload;
import io.swagger.annotations.Api;
import lombok.AllArgsConstructor;
import lombok.SneakyThrows;
import com.knowledge.core.oss.model.OssFile;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.utils.Func;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletResponse;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.List;

/**
 * 对象存储端点
 *
 * @author Chill
 */
@RestController
@AllArgsConstructor
@RequestMapping("/oss/endpoint")
@Api(value = "对象存储端点", tags = "对象存储端点")
public class OssEndpoint {

	private static final long MAX_PLUGIN_FILE_SIZE = 100L * 1024L * 1024L;
	private static final int COPY_BUFFER_SIZE = 8192;

	private OssClient ossClient;
	private OssProperties ossProperties;

	/**
	 * 创建存储桶
	 *
	 * @param bucketName 存储桶名称
	 * @return Bucket
	 */
	@SneakyThrows
	@PostMapping("/make-bucket")
	public R makeBucket(@RequestParam String bucketName) {
		ossClient.makeBucket(bucketName);
		return R.success("创建成功");
	}

	/**
	 * 创建存储桶
	 *
	 * @param bucketName 存储桶名称
	 * @return R
	 */
	@SneakyThrows
	@PostMapping("/remove-bucket")
	public R removeBucket(@RequestParam String bucketName) {
		ossClient.removeBucket(bucketName);
		return R.success("删除成功");
	}

	/**
	 * 拷贝文件
	 *
	 * @param fileName       存储桶对象名称
	 * @param destBucketName 目标存储桶名称
	 * @param destFileName   目标存储桶对象名称
	 * @return R
	 */
	@SneakyThrows
	@PostMapping("/copy-file")
	public R copyFile(@RequestParam String fileName, @RequestParam String destBucketName, String destFileName) {
		ossClient.copyFile(fileName, destBucketName, destFileName);
		return R.success("操作成功");
	}

	/**
	 * 获取文件信息
	 *
	 * @param fileName 存储桶对象名称
	 * @return InputStream
	 */
	@SneakyThrows
	@GetMapping("/stat-file")
	public R<OssFile> statFile(@RequestParam String fileName) {
		return R.data(ossClient.statFile(fileName));
	}

	/**
	 * 获取文件相对路径
	 *
	 * @param fileName 存储桶对象名称
	 * @return String
	 */
	@SneakyThrows
	@GetMapping("/file-path")
	public R<String> filePath(@RequestParam String fileName) {
		return R.data(ossClient.filePath(fileName));
	}

	/**
	 * 获取文件外链
	 *
	 * @param fileName 存储桶对象名称
	 * @return String
	 */
	@SneakyThrows
	@GetMapping("/file-link")
	public R<String> fileLink(@RequestParam String fileName) {
		return R.data(ossClient.fileLink(fileName));
	}

	/**
	 * 上传文件
	 *
	 * @param file 文件
	 * @return ObjectStat
	 */
	@SneakyThrows
	@PostMapping("/put-file")
	public R<KnowledgeFile> putFile(@RequestParam MultipartFile file) {
		KnowledgeFile knowledgeFile = ossClient.putFile(file.getOriginalFilename(), file);
		return R.data(knowledgeFile);
	}

	/**
	 * 上传插件 JavaScript 产物，并返回对应的 SRI 哈希。
	 *
	 * @param files 插件 JavaScript 文件（必须且只能上传一个）
	 * @return 上传后的对象名称、原始文件名和 SRI 哈希
	 */
	@SneakyThrows
	@PostMapping("/put-plugin-file")
	public R<PluginFileUpload> putPluginFile(@RequestParam("file") MultipartFile[] files) {
		if (files.length != 1) {
			throw new ServiceException("必须且只能上传一个插件文件");
		}

		MultipartFile file = files[0];
		String originalName = file.getOriginalFilename();
		if (file.isEmpty()) {
			throw new ServiceException("插件文件不能为空");
		}
		if (StringUtil.isBlank(originalName) || !originalName.endsWith(".js")) {
			throw new ServiceException("插件文件必须使用 .js 扩展名");
		}
		if (file.getSize() > MAX_PLUGIN_FILE_SIZE) {
			throw new ServiceException("插件文件不能超过 100 MiB");
		}

		Path stagedFile = Files.createTempFile("plugin-artifact-", ".js");
		try {
			String integrity = stageAndHash(file, stagedFile);
			KnowledgeFile uploadedFile;
			try (InputStream inputStream = new RetryableFileInputStream(stagedFile)) {
				uploadedFile = ossClient.putFile(ossProperties.getBucketName(), originalName, inputStream);
			}
			return R.data(new PluginFileUpload(uploadedFile.getName(), originalName, integrity));
		} finally {
			Files.deleteIfExists(stagedFile);
		}
	}

	private String stageAndHash(MultipartFile file, Path stagedFile) throws IOException, NoSuchAlgorithmException {
		MessageDigest digest = MessageDigest.getInstance("SHA-384");
		long totalBytes = 0L;
		byte[] buffer = new byte[COPY_BUFFER_SIZE];
		try (InputStream inputStream = new BufferedInputStream(file.getInputStream());
			 OutputStream outputStream = new BufferedOutputStream(Files.newOutputStream(stagedFile))) {
			int bytesRead;
			while ((bytesRead = inputStream.read(buffer)) != -1) {
				totalBytes += bytesRead;
				if (totalBytes > MAX_PLUGIN_FILE_SIZE) {
					throw new ServiceException("插件文件不能超过 100 MiB");
				}
				digest.update(buffer, 0, bytesRead);
				outputStream.write(buffer, 0, bytesRead);
			}
		}
		if (totalBytes == 0L) {
			throw new ServiceException("插件文件不能为空");
		}
		return "sha384-" + Base64.getEncoder().encodeToString(digest.digest());
	}

	/**
	 * Some OSS clients retry an upload with the same InputStream instance. Reopen the staged
	 * artifact after EOF or a provider-initiated close so every retry starts from byte zero.
	 */
	private static final class RetryableFileInputStream extends InputStream {

		private final Path path;
		private InputStream delegate;
		private boolean reopenBeforeRead;

		private RetryableFileInputStream(Path path) throws IOException {
			this.path = path;
			this.delegate = openStream();
		}

		@Override
		public int read() throws IOException {
			prepareForRead();
			int value = delegate.read();
			if (value == -1) {
				reopenBeforeRead = true;
			}
			return value;
		}

		@Override
		public int read(byte[] bytes, int offset, int length) throws IOException {
			prepareForRead();
			int bytesRead = delegate.read(bytes, offset, length);
			if (bytesRead == -1) {
				reopenBeforeRead = true;
			}
			return bytesRead;
		}

		@Override
		public long skip(long bytes) throws IOException {
			prepareForRead();
			return delegate.skip(bytes);
		}

		@Override
		public int available() throws IOException {
			prepareForRead();
			return delegate.available();
		}

		@Override
		public void close() throws IOException {
			if (delegate != null) {
				delegate.close();
				delegate = null;
			}
			reopenBeforeRead = true;
		}

		private void prepareForRead() throws IOException {
			if (delegate == null || reopenBeforeRead) {
				if (delegate != null) {
					delegate.close();
				}
				delegate = openStream();
				reopenBeforeRead = false;
			}
		}

		private InputStream openStream() throws IOException {
			return new BufferedInputStream(Files.newInputStream(path));
		}
	}

	/**
	 * 上传文件
	 *
	 * @param fileName 存储桶对象名称
	 * @param file     文件
	 * @return ObjectStat
	 */
	@SneakyThrows
	@PostMapping("/put-file-by-name")
	public R<KnowledgeFile> putFile(@RequestParam String fileName, @RequestParam MultipartFile file) {
		KnowledgeFile knowledgeFile = ossClient.putFile(fileName, file);
		return R.data(knowledgeFile);
	}

	/**
	 * 删除文件
	 *
	 * @param fileName 存储桶对象名称
	 * @return R
	 */
	@SneakyThrows
	@PostMapping("/remove-file")
	public R removeFile(@RequestParam String fileName) {
		ossClient.removeFile(fileName);
		return R.success("操作成功");
	}

	/**
	 * 批量删除文件
	 *
	 * @param fileNames 存储桶对象名称集合
	 * @return R
	 */
	@SneakyThrows
	@PostMapping("/remove-files")
	public R removeFiles(@RequestParam String fileNames) {
		ossClient.removeFiles(Func.toStrList(fileNames));
		return R.success("操作成功");
	}

	@GetMapping("/download")
	@SneakyThrows
	public void download(@RequestParam("fileName") String fileName,
			@RequestParam(value = "cahce", required = false) Boolean cahce,
			@RequestParam(value = "bucket", required = false) String bucket, HttpServletResponse response) {
		InputStream inputStream = StringUtil.isBlank(bucket) ? ossClient.downloadFile(fileName)
				: ossClient.downloadFile(fileName, bucket);
		if (cahce == null || cahce) {
			response.setHeader("Cache-Control", "max-age=5126400");
		}
		IoUtil.copy(inputStream, response.getOutputStream());
		inputStream.close();
	}

	/**
	 * 公开插件产物下载（免鉴权，网关放行 /oss/endpoint/public/**）。
	 * 仅允许 .js 文件，拒绝路径穿越；响应头满足 SRI 校验所需的 CORS 要求。
	 *
	 * @param fileName 存储桶对象名称（插件 resourcePath）
	 */
	@GetMapping("/public/plugin")
	@SneakyThrows
	public void downloadPlugin(@RequestParam("fileName") String fileName, HttpServletResponse response) {
		if (StringUtil.isBlank(fileName) || !fileName.endsWith(".js") || fileName.contains("..")) {
			response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
			return;
		}
		response.setHeader("Content-Type", "application/javascript;charset=utf-8");
		// 发布即换文件名（resourcePath 唯一），因此可长期缓存
		response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
		// SRI 校验要求脚本以 crossorigin=anonymous 加载，需开放 CORS
		response.setHeader("Access-Control-Allow-Origin", "*");
		InputStream inputStream = ossClient.downloadFile(fileName);
		IoUtil.copy(inputStream, response.getOutputStream());
		inputStream.close();
	}

	@GetMapping("/fileInfo")
	public R<List<KnowledgeFile>> fileInfo(@RequestParam("bucket") String bucket) {
		return R.data(ossClient.getFiles(bucket));
	}

}
