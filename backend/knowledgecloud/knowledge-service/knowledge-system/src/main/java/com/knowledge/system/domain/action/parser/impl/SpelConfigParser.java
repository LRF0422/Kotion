package com.knowledge.system.domain.action.parser.impl;

import java.io.Serializable;
import java.util.Map;

import org.springframework.context.expression.MapAccessor;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;

import com.knowledge.system.domain.action.ActionConfig;
import com.knowledge.system.domain.action.parser.AbstractConfigParser;

import cn.hutool.core.util.StrUtil;

public class SpelConfigParser extends AbstractConfigParser {

    public SpelConfigParser(ActionConfig config, Map<String, Object> data) {
        super(config, data);
    }

    @Override
    public String getParsedUrl() {
        return parse(this.config.getUrlConfig());
    }

    @Override
    public String getParsedIcon() {
        return parse(this.config.getIconConfig());
    }

    @Override
    public String getParsedTitle() {
        return parse(this.config.getTitleConfig());
    }

    @Override
    public String getParsedDesc() {
        return parse(this.config.getDescConfig());
    }

    private String parse(String plainExpression) {
        if (StrUtil.isNotEmpty(plainExpression)) {
            ExpressionParser parser = new SpelExpressionParser();
            Expression expression = parser.parseExpression(plainExpression);
            StandardEvaluationContext context = new StandardEvaluationContext();
            context.addPropertyAccessor(new MapAccessor());
            context.setVariable("data", this.data);
            return expression.getValue(context, String.class);
        }
        return "";
    }

}
