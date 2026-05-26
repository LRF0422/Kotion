package com.knowledge.core.tool.utils;

import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.exception.BusinessException;
import org.springframework.util.StringUtils;

/**
 * @author lijun
 * @data 2023/4/19
 * @apiNote
 */
public class ApiClientUtil {
	/**
	 * 服务调用结果处理
	 *
	 * @param res
	 * @param exceptionMsg
	 * @return
	 */
	public static <D> D resolvingResponse(R<D> res, String exceptionMsg) {
		String msg = !StringUtils.hasText(exceptionMsg) ? res.getMsg() : exceptionMsg;
		switch (res.getCode()) {
			case 200:
				return res.getData();
			default:
				throw new BusinessException(msg);
		}
	}

	public static <D> D resolvingResponse(R<D> res) {
		return resolvingResponse(res, null);
	}
}
