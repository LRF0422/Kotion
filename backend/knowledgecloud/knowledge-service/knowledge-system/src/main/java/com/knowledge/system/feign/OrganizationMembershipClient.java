package com.knowledge.system.feign;

import java.util.Map;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.api.ResultCode;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.application.OrganizationApplication;

import cn.hutool.core.util.StrUtil;
import lombok.AllArgsConstructor;

/**
 * 内部服务接口：把页面协作受邀人加入共享空间所属的组织上下文。
 *
 * <p>调用方是 knowledge-wiki（见 {@code com.knowledge.wiki.feign}）。身份校验使用自定义
 * 请求头中的服务令牌，而不是 {@code @PreAuthorize} + Authorization：
 * <ul>
 *   <li>Feign 默认会透传调用方的用户 Authorization，拦截器顺序不可控，方法级鉴权会随
 *       调用方身份变化而失败；</li>
 *   <li>自定义头只由 wiki 的服务令牌拦截器写入，用户无法伪造（令牌用平台密钥签名），
 *       校验独立于 Authorization，行为确定。</li>
 * </ul>
 *
 * <p>注意：本接口只允许内部服务调用，因此绝不能给普通用户开放“自助加入任意组织”的能力
 * ——组织 GUEST 能读到该上下文内老空间（visibility 为空）的内容。
 */
@RestController
@AllArgsConstructor
@RequestMapping("/organization-membership/internal")
public class OrganizationMembershipClient {

    /** 与 wiki 侧 OrganizationMembershipFeignConfiguration.INTERNAL_TOKEN_HEADER 保持一致。 */
    private static final String INTERNAL_TOKEN_HEADER = "Knowledge-Internal-Token";

    private static final String SERVICE_ACCOUNT = "internal-service";
    private static final String FUNC_SERVICE_USER_ID = "-1";

    private final OrganizationApplication organizationApplication;
    private final JwtTokenProvider jwtTokenProvider;

    @PostMapping("/ensure-member")
    public R<Boolean> ensureMember(
            @RequestHeader(value = INTERNAL_TOKEN_HEADER, required = false) String internalToken,
            @RequestParam("userId") Long userId,
            @RequestParam("contextId") String contextId) {
        if (!isInternalServiceCall(internalToken)) {
            return R.fail(ResultCode.UN_AUTHORIZED, "内部接口仅允许服务间调用");
        }
        try {
            return R.data(organizationApplication.ensureCollaborationMembership(userId, contextId));
        } catch (ServiceException rejection) {
            // 必须在 R 信封里返回原因：裸 4xx/5xx 会被 Feign 转成异常，调用方拿不到 message，
            // 用户只能看到一个没有信息量的失败。
            return R.fail(StrUtil.blankToDefault(rejection.getMessage(), "加入协作空间所属组织失败"));
        }
    }

    /** 校验请求头中的令牌是否为平台内部服务账号签发的有效令牌。 */
    private boolean isInternalServiceCall(String token) {
        if (StrUtil.isBlank(token)) {
            return false;
        }
        Jwt jwt;
        try {
            jwt = jwtTokenProvider.parseToken(token);
        } catch (RuntimeException parseFailure) {
            return false;
        }
        if (jwt == null) {
            return false;
        }
        Map<String, Object> claims = jwt.getClaims();
        return SERVICE_ACCOUNT.equals(Func.toStr(claims.get(TokenConstant.ACCOUNT)))
                && FUNC_SERVICE_USER_ID.equals(Func.toStr(claims.get(TokenConstant.USER_ID)));
    }
}
