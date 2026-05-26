# LLM-Driven Worker Configuration

## Current State

The team orchestration pipeline currently works in two disconnected phases:
1. **LLM Planning**: Generates `TaskPlan` with subtasks containing only `description`, `requiredCategories`, `dependsOn`, and `estimatedComplexity`
2. **Heuristic Assembly**: `TeamAssembler` derives worker names via keyword matching (`deriveRoleName()`), generates personas from a 3-line template (`generatePersona()`), and assigns skills via category lookup (`resolveSkills()`)

The LLM has no say in who the workers are, what they're called, or which specific skills they get.

## Design

Extend the planning phase so the LLM specifies **worker name, persona/instructions, and skill IDs** per subtask. TeamAssembler becomes a validator/assembler rather than an inferrer, falling back to heuristics only when LLM output is missing or invalid.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Skill catalog in prompt | Include all enabled non-CORE skills (id + name + description) | LLM needs to know what's available to assign |
| CORE skill handling | Still auto-included by TeamAssembler (not in LLM prompt) | CORE skills must always be present |
| Backward compatibility | All new SubTask fields are optional with fallback | Existing plans still work; graceful degradation |
| Validation | Check skill IDs exist in registry; warn and skip invalid | Prevent hallucinated skill IDs from breaking execution |

## Tasks

### Task 1: Extend TaskPlan.SubTask with worker specification fields

**File:** `knowledge-service/knowledge-agent-skills/src/main/java/com/knowledge/agent/leader/TaskPlan.java`

Add these optional fields to the inner `SubTask` class:

```java
private String workerName;              // LLM-assigned name, e.g. "Research Analyst"
private String workerPersona;           // LLM-crafted system prompt / persona instructions
private List<String> assignedSkillIds;  // Explicit skill IDs chosen by LLM
```

All fields are optional (nullable) so existing plans without them still work.

### Task 2: Enrich PlanningPromptBuilder with skills catalog and worker spec request

**File:** `knowledge-service/knowledge-agent-skills/src/main/java/com/knowledge/agent/leader/PlanningPromptBuilder.java`

Two changes:

**A) Accept and embed skills catalog in the prompt:**
- Add a parameter for the available skills list (from `SkillRegistry.getEnabledSkills()`)
- Build a skills catalog section in the system prompt listing each non-CORE skill's `id`, `name`, and `description`
- Example prompt section:
```
Available skills (assign by ID):
- id: "web_search", name: "Web Search", description: "Search the web for information"
- id: "wiki-page", name: "Wiki Page Operations", description: "Perform wiki page operations..."
- id: "data-processing-engine", name: "Data Processing", description: "Process and transform data..."
...
```

**B) Extend the JSON schema to request worker specs:**
- Add `workerName`, `workerPersona`, and `assignedSkillIds` to the subtask schema
- Update planning guidelines to instruct the LLM:
  - Give each worker a descriptive name reflecting their role
  - Write a focused persona/instruction for the worker
  - Assign specific skill IDs from the catalog that the worker needs
- Updated subtask JSON schema:
```json
{
  "id": "task-1",
  "description": "Clear description of what to accomplish",
  "workerName": "Descriptive worker name",
  "workerPersona": "You are a specialist in... Focus on...",
  "assignedSkillIds": ["skill-id-1", "skill-id-2"],
  "requiredCategories": ["category1"],
  "dependsOn": [],
  "estimatedComplexity": "LOW"
}
```

### Task 3: Refactor TeamAssembler to use LLM-provided worker specs with fallback

**File:** `knowledge-service/knowledge-agent-skills/src/main/java/com/knowledge/agent/leader/TeamAssembler.java`

Modify `assembleFromPlan()` and related methods:

**A) Worker naming (replace `deriveRoleName()`):**
- If `subtask.getWorkerName()` is non-blank, use it directly
- Otherwise, fall back to existing `deriveRoleName()` heuristic

**B) Persona generation (replace `generatePersona()`):**
- If `subtask.getWorkerPersona()` is non-blank, use it directly
- Otherwise, fall back to existing template-based `generatePersona()`

**C) Skill assignment (replace `resolveSkills()`):**
- If `subtask.getAssignedSkillIds()` is non-empty:
  - Look up each skill ID in SkillRegistry
  - Skip invalid/missing IDs with a warning log
  - If at least one valid skill found, use the LLM-assigned set
  - If ALL IDs are invalid, fall back to category-based `resolveSkills()`
- Always add CORE-tier skills regardless of source
- Otherwise, fall back to existing `resolveSkills()` with requiredCategories

### Task 4: Update LeaderAgent to pass skills catalog to PlanningPromptBuilder

**File:** `knowledge-service/knowledge-agent-skills/src/main/java/com/knowledge/agent/leader/LeaderAgent.java`

In `handleAutonomousTeam()`, where the planning prompt is built:
- Fetch enabled skills from SkillRegistry (filter out CORE-tier)
- Pass the skills list to `PlanningPromptBuilder.buildPlanningSystemPrompt()`

### Task 5: Unit tests

- Test TaskPlan deserialization with new optional fields (present and absent)
- Test TeamAssembler uses LLM-provided name/persona/skills when present
- Test TeamAssembler falls back to heuristic when fields are missing
- Test invalid skill IDs are skipped with fallback
- Test CORE skills are always included regardless of LLM assignment
