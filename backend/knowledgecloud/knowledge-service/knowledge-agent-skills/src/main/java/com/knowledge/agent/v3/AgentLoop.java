package com.knowledge.agent.v3;

import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.session.AgentSession;
import reactor.core.publisher.Flux;

/**
 * V3 execution-loop contract. The task supervisor depends only on this
 * interface; the old engine is currently supplied through a bridge adapter.
 */
public interface AgentLoop {

    Flux<AgentEvent> run(AgentSession session);

    Flux<AgentEvent> resume(AgentSession session);
}
