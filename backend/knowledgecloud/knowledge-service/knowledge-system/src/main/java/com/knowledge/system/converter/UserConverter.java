package com.knowledge.system.converter;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.dto.RegisterDTO;
import com.knowledge.system.domain.dto.TenantDTO;
import com.knowledge.system.dto.CreateClientUserDTO;
import com.knowledge.system.vo.UserVO;

import org.mapstruct.MapMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Mappings;
import org.mapstruct.factory.Mappers;

import java.util.List;

@Mapper
public interface UserConverter {

	UserConverter INSTANCE = Mappers.getMapper(UserConverter.class);

	UserVO convert(User user);

	List<UserVO> convertVO(List<User> users);

	Page<UserVO> convert(IPage<User> userIPage);

	User convert(CreateClientUserDTO dto);

	User convert(TenantDTO dto);

	User convert(RegisterDTO dto);

	@Mappings({
			@Mapping(target = "userId", source = "id"),
			@Mapping(target = "userName", source = "name")
	})
	KnowledgeUser convertKnowledgeUser(User user);

	List<KnowledgeUser> converKnowledgeUser(List<User> users);

	/**
	 * Convert IPage<User> to Page<KnowledgeUser>
	 */
	default Page<KnowledgeUser> convertKnowledgeUserPage(IPage<User> userPage) {
		if (userPage == null) {
			return null;
		}
		Page<KnowledgeUser> page = new Page<>();
		page.setRecords(converKnowledgeUser(userPage.getRecords()));
		page.setTotal(userPage.getTotal());
		page.setSize(userPage.getSize());
		page.setCurrent(userPage.getCurrent());
		page.setPages(userPage.getPages());
		return page;
	}
}
