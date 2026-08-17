package com.knowledge.agent.core.checkpoint;

/**
 * Durable checkpoint access — Redis hot (latest) + JDBC cold (latest per run).
 * A checkpoint write is a synchronous JDBC upsert: recovery correctness beats
 * write throughput here (one snapshot per step is cheap).
 */
public interface CheckpointStore {

    void save(Checkpoint checkpoint);

    Checkpoint load(String runId);
}
