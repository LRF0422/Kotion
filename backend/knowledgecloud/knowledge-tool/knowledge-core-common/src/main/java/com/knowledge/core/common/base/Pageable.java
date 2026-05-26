package com.knowledge.core.common.base;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

public interface Pageable {

    Integer getCurrent();

    Integer getPageSize();

    default <T> IPage<T> page() {
        return new Page<>(getCurrent(), getPageSize());
    }
}
