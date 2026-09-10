package com.knowledge.agent.core.savedskill;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Deterministic lexical retrieval with explicit CJK bigram support. */
@Component
public class KeywordSavedSkillRetriever implements SavedSkillRetriever {

    @Override
    public List<SavedSkillMatch> retrieve(List<SavedSkill> candidates, String query,
                                          Set<String> availableToolNames,
                                          double minScore, int limit) {
        if (query == null || query.trim().isEmpty() || candidates == null || candidates.isEmpty()) {
            return Collections.emptyList();
        }
        Set<String> available = availableToolNames != null
                ? availableToolNames : Collections.emptySet();
        Set<String> queryTokens = tokens(query);
        String normalizedQuery = normalizePhrase(query);
        List<SavedSkillMatch> matches = new ArrayList<>();
        for (SavedSkill skill : candidates) {
            List<String> requiredTools = skill != null
                    ? safeList(skill.getRequiredToolNames()) : Collections.emptyList();
            if (skill == null || !skill.isEnabled() || !available.containsAll(requiredTools)) {
                continue;
            }
            double score = score(skill, normalizedQuery, queryTokens);
            if (score + 1.0e-9 < minScore) {
                continue;
            }
            List<String> compatible = new ArrayList<>();
            compatible.addAll(requiredTools);
            for (String optional : safeList(skill.getOptionalToolNames())) {
                if (available.contains(optional) && !compatible.contains(optional)) {
                    compatible.add(optional);
                }
            }
            matches.add(new SavedSkillMatch(skill, score, compatible));
        }
        matches.sort(Comparator
                .comparingDouble(SavedSkillMatch::getScore).reversed()
                .thenComparing((SavedSkillMatch match) -> value(match.getSkill().getLastUsedTime()),
                        Comparator.reverseOrder())
                .thenComparing((SavedSkillMatch match) -> match.getSkill().getUpdateTime(),
                        Comparator.reverseOrder())
                .thenComparing(match -> safe(match.getSkill().getSkillId())));
        int bounded = Math.max(0, Math.min(limit, matches.size()));
        return new ArrayList<>(matches.subList(0, bounded));
    }

    private double score(SavedSkill skill, String normalizedQuery, Set<String> queryTokens) {
        double trigger = coverage(queryTokens, tokens(skill.getTriggerText()));
        double example = 0.0;
        for (String intent : safeList(skill.getExampleIntents())) {
            example = Math.max(example, coverage(queryTokens, tokens(intent)));
        }
        double tags = coverage(queryTokens, tokens(String.join(" ", safeList(skill.getTags()))));
        double description = coverage(queryTokens,
                tokens(safe(skill.getName()) + " " + safe(skill.getDescription())));
        double score = trigger * 0.45 + example * 0.25 + tags * 0.20 + description * 0.10;
        if (containsPhrase(normalizedQuery, skill.getTriggerText())) {
            score += 0.15;
        } else {
            for (String intent : safeList(skill.getExampleIntents())) {
                if (containsPhrase(normalizedQuery, intent)) {
                    score += 0.15;
                    break;
                }
            }
        }
        return Math.min(1.0, score);
    }

    private boolean containsPhrase(String normalizedQuery, String candidate) {
        String phrase = normalizePhrase(candidate);
        if (phrase.length() < 4 || normalizedQuery.isEmpty()) {
            return false;
        }
        return normalizedQuery.contains(phrase) || phrase.contains(normalizedQuery);
    }

    private double coverage(Set<String> query, Set<String> candidate) {
        if (query.isEmpty() || candidate.isEmpty()) {
            return 0.0;
        }
        int intersection = 0;
        for (String token : candidate) {
            if (query.contains(token)) {
                intersection++;
            }
        }
        if (intersection == 0) {
            return 0.0;
        }
        // Dice-style coverage requires overlap on both sides; a single generic
        // token must not activate an otherwise unrelated procedural skill.
        return Math.min(1.0, (2.0 * intersection) / (query.size() + candidate.size()));
    }

    Set<String> tokens(String value) {
        LinkedHashSet<String> result = new LinkedHashSet<>();
        if (value == null) {
            return result;
        }
        String lower = value.toLowerCase(Locale.ROOT);
        StringBuilder word = new StringBuilder();
        StringBuilder han = new StringBuilder();
        for (int i = 0; i < lower.length(); i++) {
            char current = lower.charAt(i);
            if (Character.UnicodeScript.of(current) == Character.UnicodeScript.HAN) {
                flushWord(result, word);
                han.append(current);
            } else {
                flushHan(result, han);
                if (Character.isLetterOrDigit(current)) {
                    word.append(current);
                } else {
                    flushWord(result, word);
                }
            }
        }
        flushWord(result, word);
        flushHan(result, han);
        result.removeAll(java.util.Arrays.asList(
                "a", "an", "the", "to", "of", "for", "and", "or", "is", "are", "please"));
        return result;
    }

    private void flushWord(Set<String> result, StringBuilder word) {
        if (word.length() > 0) {
            result.add(word.toString());
            word.setLength(0);
        }
    }

    private void flushHan(Set<String> result, StringBuilder han) {
        if (han.length() == 1) {
            result.add(han.toString());
        } else if (han.length() > 1) {
            for (int i = 0; i < han.length() - 1; i++) {
                result.add(han.substring(i, i + 2));
            }
            if (han.length() <= 8) {
                result.add(han.toString());
            }
        }
        han.setLength(0);
    }

    private String normalizePhrase(String value) {
        if (value == null) {
            return "";
        }
        return value.toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}]+", " ")
                .trim()
                .replaceAll("\\s+", " ");
    }

    private Long value(Long value) {
        return value != null ? value : 0L;
    }

    private List<String> safeList(List<String> values) {
        return values != null ? values : Collections.emptyList();
    }

    private String safe(String value) {
        return value != null ? value : "";
    }
}
