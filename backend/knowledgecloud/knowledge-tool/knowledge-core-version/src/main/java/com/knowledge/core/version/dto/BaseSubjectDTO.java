package com.knowledge.core.version.dto;

import java.io.Serializable;

import lombok.Data;

@Data
public abstract class BaseSubjectDTO implements Serializable {

    private boolean publish = false;
}
