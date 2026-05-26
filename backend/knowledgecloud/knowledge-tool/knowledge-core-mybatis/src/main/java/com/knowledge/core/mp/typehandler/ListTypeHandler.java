package com.knowledge.core.mp.typehandler;

import com.knowledge.core.tool.jackson.JsonUtil;
import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedJdbcTypes;
import org.apache.ibatis.type.MappedTypes;
import org.springframework.util.StringUtils;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@MappedJdbcTypes(JdbcType.VARCHAR)  //数据库类型
@MappedTypes({List.class})          //java数据类型
public abstract class ListTypeHandler<T> extends BaseTypeHandler<List<T>> {
	@Override
	public void setNonNullParameter(PreparedStatement ps, int i, List<T> parameter, JdbcType jdbcType) throws SQLException {
		String content = StringUtils.isEmpty(parameter) ? null : JsonUtil.toJson(parameter);
		ps.setString(i, content);
	}
	@Override
	public List<T> getNullableResult(ResultSet rs, String columnName) throws SQLException {
		return this.getListByJsonArrayString(rs.getString(columnName));
	}

	@Override
	public List<T> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
		return this.getListByJsonArrayString(rs.getString(columnIndex));
	}

	@Override
	public List<T> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
		return this.getListByJsonArrayString(cs.getString(columnIndex));
	}

	private List<T> getListByJsonArrayString(String content) {
		return StringUtils.isEmpty(content) ? new ArrayList<>() : JsonUtil.parseArray(content, this.specificType());
	}

	/**
	 * 具体类型，由子类提供
	 * @return 具体类型
	 */
	protected abstract Class<T> specificType();
}
