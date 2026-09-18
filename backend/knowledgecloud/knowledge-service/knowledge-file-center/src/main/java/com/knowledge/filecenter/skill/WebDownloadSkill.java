package com.knowledge.filecenter.skill;

import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;

import com.knowledge.core.agent.annotation.AgentSkill;
import com.knowledge.core.agent.annotation.SkillTierValue;
import com.knowledge.core.agent.annotation.SkillTool;
import com.knowledge.core.agent.annotation.ToolParam;
import com.knowledge.filecenter.application.FileApplication;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Web Download skill.
 *
 * <p>Downloads a file from an HTTP(S) URL into the file center. The heavy
 * lifting lives in
 * {@link com.knowledge.filecenter.service.RemoteFileDownloadService}, which
 * streams the response to a temporary file, rejects SSRF targets, re-validates
 * every redirect hop, retries transient failures and derives a sane file name
 * from {@code Content-Disposition}. This class only validates the tool inputs
 * and formats the result for the model.
 *
 * <p>Tools provided:
 * <ul>
 *   <li><b>download_file</b> - download a file from a URL and save it to a file
 *       center folder</li>
 * </ul>
 */
@Slf4j
@AgentSkill(id = "web-download", name = "Web Download", description = "Download files from URLs and save them to the file center. "
        + "Handles anti-crawling protections including User-Agent rotation, cookie sessions, "
        + "retry with backoff, and HEAD pre-checks. Blocks internal/loopback targets to prevent SSRF. "
        + "Downloaded files are saved into specified folders in the file center "
        + "and uploaded to cloud storage.", version = "2.0.0", author = "KnowledgeCloud", tier = SkillTierValue.DOMAIN, categories = {
                "file-management", "web", "download" })
public class WebDownloadSkill {

    private static final Pattern URL_PATTERN = Pattern.compile("^https?://.*", Pattern.CASE_INSENSITIVE);

    @Autowired
    private WebDownloadProperties properties;

    @Autowired
    private FileApplication fileApplication;

    /**
     * Download a file from a URL and save it to a folder in the file center.
     *
     * @param fileUrl       the URL of the file to download
     * @param fileName      custom filename (optional, derived from
     *                      Content-Disposition / the URL / content type)
     * @param parentId      the parent folder ID to save the file into (null/0 for
     *                      root)
     * @param repositoryKey the repository key (null for default)
     * @param checkFirst    whether to HEAD-check the URL before downloading
     *                      (default: configured value)
     * @return result message with file details
     */
    @SkillTool(name = "download_file", description = "Download a file from a public HTTP(S) URL and save it to a folder in the file center. "
            + "Streams large files without buffering them in memory, blocks internal/loopback URLs (SSRF), "
            + "follows redirects safely, retries transient failures, and derives the filename from "
            + "Content-Disposition when available. The file is uploaded to cloud storage and a record is "
            + "created in the file center. Returns the saved file's ID, name, size, storage path and folder info.")
    public String downloadFile(
            @ToolParam(name = "fileUrl", description = "The URL of the file to download. Must be a public http:// or https:// URL.", type = "string", required = true) String fileUrl,
            @ToolParam(name = "fileName", description = "Custom filename for the saved file. If not provided, derived from the URL or Content-Disposition header.", type = "string", required = false) String fileName,
            @ToolParam(name = "parentId", description = "The parent folder ID to save the file into. Use 0 or null for root.", type = "number", required = false) Long parentId,
            @ToolParam(name = "repositoryKey", description = "The repository key. Leave empty to use the default repository.", type = "string", required = false) String repositoryKey,
            @ToolParam(name = "checkFirst", description = "Whether to send a HEAD request first to verify accessibility and read Content-Length/Content-Disposition before downloading (default: true).", type = "boolean", required = false) Boolean checkFirst) {

        if (StrUtil.isBlank(fileUrl)) {
            return "Error: Missing required parameter: fileUrl";
        }
        String url = fileUrl.trim();
        if (!URL_PATTERN.matcher(url).matches()) {
            return "Error: Invalid URL format. URL must start with http:// or https://";
        }
        if (!properties.isEnabled()) {
            return "Error: Web Download skill is disabled.";
        }

        boolean shouldCheckFirst = checkFirst != null ? checkFirst : properties.isHeadCheckEnabled();
        log.info("WebDownloadSkill downloading: url='{}', fileName='{}', parentId={}, checkFirst={}",
                url, fileName, parentId, shouldCheckFirst);

        try {
            KnowledgeFileVO fileVO = fileApplication.downloadFromUrl(url, fileName, parentId, repositoryKey,
                    shouldCheckFirst);
            log.info("WebDownloadSkill downloaded '{}' saved as id={}", url, fileVO.getId());
            return buildResult(fileVO, url);
        } catch (IllegalArgumentException e) {
            // Invalid/unsafe URL: the message is already user-facing.
            return "Error: " + e.getMessage();
        } catch (Exception e) {
            log.error("WebDownloadSkill download error for URL '{}': {}", url, e.getMessage(), e);
            return "Error downloading file: " + e.getMessage();
        }
    }

    private static String buildResult(KnowledgeFileVO fileVO, String fileUrl) {
        StringBuilder result = new StringBuilder();
        result.append("# File Downloaded\n\n");
        result.append("**File ID:** ").append(fileVO.getId()).append("\n");
        result.append("**Name:** ").append(fileVO.getName()).append("\n");
        result.append("**Size:** ").append(fileVO.getSize() != null ? formatSize(fileVO.getSize()) : "unknown")
                .append(" (").append(fileVO.getSize() != null ? fileVO.getSize() : 0).append(" bytes)\n");
        result.append("**Parent ID:** ").append(fileVO.getParentId()).append("\n");
        if (StrUtil.isNotBlank(fileVO.getRepositoryKey())) {
            result.append("**Repository:** ").append(fileVO.getRepositoryKey()).append("\n");
        }
        if (StrUtil.isNotBlank(fileVO.getPath())) {
            result.append("**Storage Path:** ").append(fileVO.getPath()).append("\n");
        }
        result.append("**Source URL:** ").append(fileUrl).append("\n");
        result.append("\nFile downloaded and saved to the file center successfully.");
        return result.toString();
    }

    private static String formatSize(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        if (bytes < 1024L * 1024) {
            return String.format(java.util.Locale.ROOT, "%.1f KB", bytes / 1024.0);
        }
        if (bytes < 1024L * 1024 * 1024) {
            return String.format(java.util.Locale.ROOT, "%.1f MB", bytes / (1024.0 * 1024));
        }
        return String.format(java.util.Locale.ROOT, "%.1f GB", bytes / (1024.0 * 1024 * 1024));
    }
}
