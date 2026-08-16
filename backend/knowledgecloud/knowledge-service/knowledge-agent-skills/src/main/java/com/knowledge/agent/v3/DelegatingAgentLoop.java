package com.knowledge.agent.v3;

import com.knowledge.agent.v2.engine.AgentEngine;
import com.knowledge.agent.v2.event.AgentEvent;
import com.knowledge.agent.v2.session.AgentSession;
import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Flux;

/**
 * Temporary bridge from V3 loop contract to the existing V2 engine. It will be
 * replaced by the native V3 loop without changing AgentJobService or transport.
 */
@RequiredArgsConstructor
public class DelegatingAgentLoop implements AgentLoop {

    private final AgentEngine engine;

    @Override
    public Flux<AgentEvent> run(AgentSession session) {
        return engine.run(session);
    }

    @Override
    public Flux<AgentEvent> resume(AgentSession session) {
        return engine.resume(session);
    }
}
