package com.knowledge.filecenter.entity.vo;

import java.io.Serializable;

import com.knowledge.file.api.entity.enums.MediaType;

import lombok.Data;

/**
 * Result of reading a file's content from object storage.
 * <p>
 * Text-like files are decoded as UTF-8 and may be truncated. Binary files only
 * carry metadata plus a {@link #message} explaining why no text was returned.
 */
@Data
public class FileContentVO implements Serializable {

    private Long id;
    private String name;
    private String suffix;
    private MediaType mediaType;
    private Long size;

    /** True when {@link #content} holds decoded text. */
    private boolean text;

    /** True when the text was cut off at the requested character limit. */
    private boolean truncated;

    /** Text content (UTF-8) when {@link #text} is true; otherwise null. */
    private String content;

    /** Content encoding of {@link #content}, currently always "utf-8" when present. */
    private String encoding;

    /** Human-readable explanation when the content could not be returned as text. */
    private String message;

}
