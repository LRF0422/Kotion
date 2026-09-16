package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingChangelog;
import com.knowledge.system.mapper.LandingChangelogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 更新日志聚合服务（抓取 GitHub Releases 并缓存）
 */
@Service
@RequiredArgsConstructor
public class LandingChangelogService {

	private final LandingChangelogMapper changelogMapper;

	@Value("${knowledge.landing.github-repo:LRF0422/knowledge-repo}")
	private String githubRepo;

	@Value("${knowledge.landing.github-token:}")
	private String githubToken;

	/**
	 * 公开：已发布的更新日志（置顶优先）。
	 */
	public List<LandingChangelog> list(int limit) {
		return changelogMapper.selectList(Wrappers.<LandingChangelog>lambdaQuery()
			.eq(LandingChangelog::getHidden, false)
			.orderByDesc(LandingChangelog::getPinned)
			.orderByDesc(LandingChangelog::getPublishedAt)
			.last("LIMIT " + Math.max(1, Math.min(limit, 100))));
	}

	public List<LandingChangelog> adminList() {
		return changelogMapper.selectList(Wrappers.<LandingChangelog>lambdaQuery()
			.orderByDesc(LandingChangelog::getPinned)
			.orderByDesc(LandingChangelog::getPublishedAt)
			.last("LIMIT 100"));
	}

	/**
	 * 抓取 GitHub Releases 并 upsert，返回同步条数。
	 */
	public int refresh() {
		String url = "https://api.github.com/repos/" + githubRepo + "/releases?per_page=30";
		HttpRequest request = HttpRequest.get(url)
			.header("User-Agent", "kotion-ops")
			.header("Accept", "application/vnd.github+json")
			.timeout(15000);
		if (StrUtil.isNotBlank(githubToken)) {
			request.header("Authorization", "Bearer " + githubToken);
		}
		String body;
		try {
			body = request.execute().body();
		} catch (Exception e) {
			throw new ServiceException("抓取 GitHub Releases 失败：" + e.getMessage());
		}
		if (StrUtil.isBlank(body)) {
			throw new ServiceException("GitHub 返回为空");
		}

		JSONArray releases;
		try {
			releases = JSONUtil.parseArray(body);
		} catch (Exception e) {
			throw new ServiceException("GitHub 返回格式异常：" + StrUtil.sub(body, 0, 200));
		}

		LocalDateTime now = LocalDateTime.now();
		int count = 0;
		for (Object item : releases) {
			if (!(item instanceof JSONObject)) {
				continue;
			}
			JSONObject release = (JSONObject) item;
			String releaseId = release.getStr("id");
			if (StrUtil.isBlank(releaseId)) {
				continue;
			}
			LandingChangelog row = changelogMapper.selectOne(Wrappers.<LandingChangelog>lambdaQuery()
				.eq(LandingChangelog::getReleaseId, releaseId)
				.last("LIMIT 1"));
			boolean creating = row == null;
			if (creating) {
				row = new LandingChangelog();
				row.setReleaseId(releaseId);
				row.setPinned(false);
				row.setHidden(false);
				row.setCreateTime(now);
			}
			row.setTag(StrUtil.sub(release.getStr("tag_name"), 0, 64));
			row.setName(StrUtil.sub(release.getStr("name"), 0, 255));
			row.setBody(release.getStr("body"));
			row.setUrl(StrUtil.sub(release.getStr("html_url"), 0, 512));
			JSONObject author = release.getJSONObject("author");
			row.setAuthor(author == null ? null : StrUtil.sub(author.getStr("login"), 0, 128));
			row.setPrerelease(release.getBool("prerelease", false));
			row.setPublishedAt(parseIso(release.getStr("published_at")));
			row.setFetchedAt(now);
			row.setUpdateTime(now);
			if (creating) {
				changelogMapper.insert(row);
			} else {
				changelogMapper.updateById(row);
			}
			count++;
		}
		return count;
	}

	public void update(Long id, Boolean pinned, Boolean hidden) {
		LandingChangelog row = changelogMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("更新日志不存在");
		}
		if (pinned != null) {
			row.setPinned(pinned);
		}
		if (hidden != null) {
			row.setHidden(hidden);
		}
		row.setUpdateTime(LocalDateTime.now());
		changelogMapper.updateById(row);
	}

	private LocalDateTime parseIso(String value) {
		if (StrUtil.isBlank(value)) {
			return null;
		}
		try {
			return OffsetDateTime.parse(value).toLocalDateTime();
		} catch (Exception e) {
			return null;
		}
	}
}
