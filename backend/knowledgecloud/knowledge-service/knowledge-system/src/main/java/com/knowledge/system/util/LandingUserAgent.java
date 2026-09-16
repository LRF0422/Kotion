package com.knowledge.system.util;

import java.util.regex.Pattern;

/**
 * 落地页轻量 User-Agent 解析：只区分设备/浏览器/操作系统与爬虫，避免引入额外依赖。
 */
public final class LandingUserAgent {

	private static final Pattern BOT = Pattern.compile(
		"bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|applebot|"
			+ "petalbot|bytespider|yandex|duckduck|semrush|ahrefs|headlesschrome|lighthouse|pingdom|uptimerobot",
		Pattern.CASE_INSENSITIVE);

	private LandingUserAgent() {
	}

	public static boolean isBot(String userAgent) {
		return userAgent == null || userAgent.isEmpty() || BOT.matcher(userAgent).find();
	}

	public static String device(String ua) {
		if (ua == null) {
			return "unknown";
		}
		if (Pattern.compile("iphone|ipod|android.*mobile|windows phone", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "mobile";
		}
		if (Pattern.compile("ipad|tablet|android(?!.*mobile)|kindle|silk", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "tablet";
		}
		return "desktop";
	}

	public static String browser(String ua) {
		if (ua == null) {
			return "unknown";
		}
		if (Pattern.compile("micromessenger", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "WeChat";
		}
		if (Pattern.compile("edg/", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "Edge";
		}
		if (Pattern.compile("opr/|opera", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "Opera";
		}
		if (Pattern.compile("firefox/", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "Firefox";
		}
		if (Pattern.compile("chrome/|crios/", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "Chrome";
		}
		if (Pattern.compile("safari/", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "Safari";
		}
		return "Other";
	}

	public static String os(String ua) {
		if (ua == null) {
			return "unknown";
		}
		if (Pattern.compile("windows", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "Windows";
		}
		if (Pattern.compile("macintosh|mac os x", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "macOS";
		}
		if (Pattern.compile("android", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "Android";
		}
		if (Pattern.compile("iphone|ipad|ipod|ios", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "iOS";
		}
		if (Pattern.compile("linux", Pattern.CASE_INSENSITIVE).matcher(ua).find()) {
			return "Linux";
		}
		return "Other";
	}

	public static String clientIp(String forwardedFor, String realIp, String remoteAddr) {
		if (forwardedFor != null && !forwardedFor.isEmpty()) {
			int comma = forwardedFor.indexOf(',');
			return (comma > 0 ? forwardedFor.substring(0, comma) : forwardedFor).trim();
		}
		if (realIp != null && !realIp.isEmpty()) {
			return realIp;
		}
		return remoteAddr;
	}

	public static String sha256(String value) {
		try {
			byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
				.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
			StringBuilder sb = new StringBuilder(digest.length * 2);
			for (byte b : digest) {
				sb.append(String.format("%02x", b));
			}
			return sb.toString();
		} catch (Exception e) {
			return null;
		}
	}
}
