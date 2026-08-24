package com.knowledge.wiki.service.entity.event;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Signals that an authoritative PageDoc transaction produced a new committed rev.
 * Consumers must use an AFTER_COMMIT listener and rebuild projections from
 * {@code wiki_block}; the event deliberately carries no mutable block payload.
 */
@Getter
@AllArgsConstructor
public class PageDocChangedEvent {

    private final Long pageId;
    private final Long rev;
}
