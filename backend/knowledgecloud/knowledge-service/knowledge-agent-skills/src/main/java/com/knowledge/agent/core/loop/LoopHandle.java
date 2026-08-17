package com.knowledge.agentcore.loop;

import com.knowledge.agentcore.run.AgentRun;

import java.util.concurrent.Future;

/**
 * The supervisor's registry entry for one live loop: the run, its gate (for
 * resume/cancel) and the executor future.
 */
public class LoopHandle {

    public final AgentRun run;
    public final AgentLoop loop;
    public final ResumeGate gate;
    public final Future<?> future;
    public final long startedAt;

    public LoopHandle(AgentRun run, AgentLoop loop, ResumeGate gate, Future<?> future) {
        this.run = run;
        this.loop = loop;
        this.gate = gate;
        this.future = future;
        this.startedAt = System.currentTimeMillis();
    }
}
