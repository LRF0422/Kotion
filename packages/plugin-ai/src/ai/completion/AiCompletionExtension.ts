import { Editor, Extension, KeyboardShortcutCommand } from "@kn/editor";
import { Plugin, PluginKey } from "@kn/editor";
import { Decoration, DecorationSet } from "@kn/editor";
import { aiGeneration } from "../utils";

/**
 * Performs the actual AI completion
 */
const performCompletion = (editor: Editor, context: string, pos: number, options: AiCompletionOptions) => {
    const { onCompletionStart, onCompletionEnd, onCompletionError, enablePlaceholderMode, placeholderStyle } = options;

    // Call the start callback
    onCompletionStart?.();

    // Generate AI completion based on context
    const prompt = `Complete the following text: "${context}". Provide a coherent continuation.`;

    let fullResponse = "";

    try {
        // Send start signal
        const startTransaction = editor.state.tr;
        startTransaction.setMeta('ai-completion', { type: 'start', pos });
        editor.view.dispatch(startTransaction);

        // Use the existing AI utility to generate text
        aiGeneration(prompt, (chunk: string) => {
            fullResponse += chunk;

            if (enablePlaceholderMode) {
                // Update the placeholder content in the editor state
                const transaction = editor.state.tr;
                transaction.setMeta('ai-placeholder-update', {
                    pos,
                    content: fullResponse,
                    style: placeholderStyle || "color: #9CA3AF; font-style: italic;"
                });
                editor.view.dispatch(transaction);
            } else {
                // Show loading state using the existing loading decoration mechanism
                editor.chain().focus().toggleLoadingDecoration(pos, fullResponse).run();
            }
        })
            .then((completeResult: string) => {
                if (enablePlaceholderMode) {
                    // Send finish signal to cleanup and prepare for acceptance
                    const finishTransaction = editor.state.tr;
                    finishTransaction.setMeta('ai-completion', { type: 'finish', pos });
                    editor.view.dispatch(finishTransaction);
                } else {
                    // Insert the final result directly
                    editor.chain().focus()
                        .insertContentAt(pos, completeResult, {
                            applyInputRules: false,
                            applyPasteRules: false,
                            parseOptions: {
                                preserveWhitespace: false
                            }
                        }).run();

                    // Remove loading decoration
                    editor.chain().removeLoadingDecoration().run();
                }

                // Call the end callback
                onCompletionEnd?.();
            })
            .catch((err: any) => {
                console.error("AI completion error:", err);

                // Send finish signal on error
                const errorTransaction = editor.state.tr;
                errorTransaction.setMeta('ai-completion', { type: 'finish', pos });
                editor.view.dispatch(errorTransaction);

                if (enablePlaceholderMode) {
                    // Clear placeholder state
                    const clearTransaction = editor.state.tr;
                    clearTransaction.setMeta('ai-placeholder-clear', true);
                    editor.view.dispatch(clearTransaction);
                } else {
                    // Remove loading decoration
                    editor.chain().removeLoadingDecoration().run();
                }

                // Call the error callback
                onCompletionError?.(err as Error);
            });
    } catch (err) {
        console.error("AI completion error:", err);

        // Send finish signal on error
        const errorTransaction = editor.state.tr;
        errorTransaction.setMeta('ai-completion', { type: 'finish', pos });
        editor.view.dispatch(errorTransaction);

        if (enablePlaceholderMode) {
            // Clear placeholder state
            const clearTransaction = editor.state.tr;
            clearTransaction.setMeta('ai-placeholder-clear', true);
            editor.view.dispatch(clearTransaction);
        } else {
            // Remove loading decoration
            editor.chain().removeLoadingDecoration().run();
        }

        // Call the error callback
        onCompletionError?.(err as Error);
    }
}

export interface AiCompletionOptions {
    /**
     * Trigger completion when Tab is pressed
     * @default true
     */
    enableTabCompletion?: boolean;

    /**
     * Prefix to identify when to trigger AI completion
     * @default "ai:"
     */
    triggerPrefix?: string;

    /**
     * Whether to show completion as placeholder first
     * @default true
     */
    enablePlaceholderMode?: boolean;

    /**
     * Placeholder text style
     * @default "color: #9CA3AF; font-style: italic;"
     */
    placeholderStyle?: string;

    /**
     * Callback when completion starts
     */
    onCompletionStart?: () => void;

    /**
     * Callback when completion ends
     */
    onCompletionEnd?: () => void;

    /**
     * Callback when completion fails
     */
    onCompletionError?: (error: Error) => void;
}

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        aiCompletion: {
            /**
             * Triggers AI completion at current cursor position
             */
            triggerAiCompletion: () => ReturnType;

            /**
             * Accept the AI completion placeholder
             */
            acceptAiCompletion: () => ReturnType;

            /**
             * Cancel ongoing AI completion
             */
            cancelAiCompletion: () => ReturnType;
        };
    }
    interface Storage {
        aiCompletion: {
            placeholderContent?: string;
            placeholderPos?: number;
        };
    }
}

/**
 * AI Completion Extension
 * Provides AI-powered text completion triggered by Tab key
 */
export const AiCompletionExtension = Extension.create<AiCompletionOptions>({
    name: "aiCompletion",

    // Set a high priority to ensure it takes precedence over other tab handlers
    priority: 200,

    addOptions() {
        return {
            enableTabCompletion: true,
            triggerPrefix: "ai:",
            enablePlaceholderMode: true,
            placeholderStyle: "color: #9CA3AF; font-style: italic;",
            onCompletionStart: () => { },
            onCompletionEnd: () => { },
            onCompletionError: () => { },
        };
    },

    addCommands() {
        return {
            triggerAiCompletion: () => ({ editor, tr, dispatch }) => {
                const { triggerPrefix, enablePlaceholderMode } = this.options;
                const { selection } = editor.state;
                const { $from } = selection;

                // Get the text before the cursor to check for trigger prefix
                // const textBeforeCursor = editor.view.state.doc.textBetween(
                //     Math.max(0, $from.pos - triggerPrefix!.length),
                //     $from.pos
                // );

                // Get the current block content for context (from the start of the block to the cursor position)
                const blockStart = $from.start($from.depth);
                const blockContent = editor.view.state.doc.textBetween(blockStart, $from.pos);

                // Check if the text before cursor matches the trigger prefix
                // if (textBeforeCursor.toLowerCase() === triggerPrefix) {
                //     // Remove the trigger prefix
                //     const transaction = tr.delete(
                //         $from.pos - triggerPrefix.length,
                //         $from.pos
                //     );

                //     if (dispatch) {
                //         editor.view.dispatch(transaction);
                //     }

                //     // Trigger AI completion with the block content as context
                //     performCompletion(editor, blockContent, $from.pos - triggerPrefix.length, this.options);

                //     return true;
                // }

                // If no trigger prefix, use the current block content as context
                performCompletion(editor, blockContent, $from.pos, this.options);

                return true;
            },

            acceptAiCompletion: () => ({ editor, tr, dispatch }) => {
                // Get the plugin state to get the stored completion result
                const pluginKey = new PluginKey('ai-completion');
                const pluginState = pluginKey.getState(editor.state);

                // First try to use the stored completion result from finish state
                if (pluginState && pluginState.completionResult && pluginState.completionResult.result && pluginState.completionResult.pos !== undefined) {
                    // Insert the stored completion result at the stored position
                    editor.chain()
                        .insertContentAt(pluginState.completionResult.pos, pluginState.completionResult.result, {
                            applyInputRules: false,
                            applyPasteRules: false,
                            parseOptions: {
                                preserveWhitespace: false
                            }
                        })
                        .focus()
                        .run();

                    // Clear the stored result and placeholder
                    const transaction = editor.state.tr;
                    transaction.setMeta('ai-placeholder-clear', true);
                    editor.view.dispatch(transaction);

                    return true;
                }

                // Fallback: try to use current placeholder content if no stored result
                if (pluginState && pluginState.placeholderContent && pluginState.placeholderPos !== null) {
                    // Insert the current placeholder content at the stored position
                    editor.chain()
                        .insertContentAt(pluginState.placeholderPos, pluginState.placeholderContent, {
                            applyInputRules: false,
                            applyPasteRules: false,
                            parseOptions: {
                                preserveWhitespace: false
                            }
                        })
                        .focus()
                        .run();

                    // Clear the placeholder
                    const transaction = editor.state.tr;
                    transaction.setMeta('ai-placeholder-clear', true);
                    editor.view.dispatch(transaction);

                    return true;
                }

                // Last resort: check for transaction-stored result
                const storedResult = tr.getMeta('ai-completion-result');
                if (storedResult && storedResult.result && storedResult.pos !== undefined) {
                    // Insert the AI result at the stored position
                    editor.chain()
                        .insertContentAt(storedResult.pos, storedResult.result, {
                            applyInputRules: false,
                            applyPasteRules: false,
                            parseOptions: {
                                preserveWhitespace: false
                            }
                        })
                        .focus()
                        .run();

                    // Clear the stored result
                    const transaction = tr;
                    transaction.setMeta('ai-completion-result', null);
                    if (dispatch) {
                        editor.view.dispatch(transaction);
                    }

                    return true;
                }

                return false;
            },

            cancelAiCompletion: () => ({ editor, tr, dispatch }) => {
                // Remove any ongoing completion decorations
                const decorations = tr.storedMarks || [];
                if (decorations.length > 0) {
                    if (dispatch) {
                        editor.view.dispatch(tr.setStoredMarks([]));
                    }
                }
                return true;
            },
        };
    },

    addKeyboardShortcuts() {
        const bindings: { [key: string]: KeyboardShortcutCommand } = {};

        if (this.options.enableTabCompletion) {
            bindings.Tab = () => {
                // Get the plugin state to check if there's an AI placeholder to accept
                const pluginKey = new PluginKey('ai-completion');
                const pluginState = pluginKey.getState(this.editor.state);
                const hasPlaceholder = pluginState && pluginState.placeholderContent;

                if (hasPlaceholder && this.options.enablePlaceholderMode) {
                    // Accept the current placeholder
                    return this.editor.commands.acceptAiCompletion();
                }

                // Only trigger new completion if we're not in a list item or other special context where tab has meaning
                const isListItem = this.editor.isActive('listItem');
                const isCodeBlock = this.editor.isActive('codeBlock');

                if (!isListItem && !isCodeBlock) {
                    return this.editor.commands.triggerAiCompletion();
                }

                // If we are in a list or code block, let the default behavior handle it
                return false;
            };
        }

        return bindings;
    },

    addProseMirrorPlugins() {
        const pluginKey = new PluginKey("ai-completion")
        return [
            new Plugin({
                key: pluginKey,
                state: {
                    init() {
                        return {
                            completionActive: false,
                            completionText: "",
                            decorationSet: DecorationSet.empty,
                            placeholderContent: null,
                            placeholderPos: null,
                        };
                    },
                    apply(tr, prev) {
                        // Handle AI placeholder updates
                        const placeholderUpdate = tr.getMeta('ai-placeholder-update');
                        if (placeholderUpdate) {
                            const { pos, content, style } = placeholderUpdate;
                            // Create a widget decoration for the placeholder
                            const deco = Decoration.widget(pos, () => {
                                const span = document.createElement("span");
                                span.textContent = content;
                                span.style.cssText = style;
                                span.setAttribute('data-ai-placeholder', 'true');
                                return span;
                            }, {
                                key: `ai-placeholder-${pos}`,
                            });

                            return {
                                ...prev,
                                placeholderContent: content,
                                placeholderPos: pos,
                                decorationSet: DecorationSet.create(tr.doc, [deco]),
                            };
                        }

                        // Handle clearing placeholder
                        const shouldClear = tr.getMeta('ai-placeholder-clear');
                        if (shouldClear) {
                            console.log('Clearing placeholder');
                            return {
                                ...prev,
                                placeholderContent: null,
                                placeholderPos: null,
                                completionResult: null, // Also clear any stored result
                                decorationSet: DecorationSet.empty,
                            };
                        }

                        // Check if this is a completion transaction
                        const meta = tr.getMeta("ai-completion");
                        if (meta) {
                            console.log("AI Completion Meta", meta);

                            if (meta.type === "start") {
                                return {
                                    ...prev,
                                    completionActive: true,
                                    completionText: "",
                                    decorationSet: DecorationSet.empty,
                                };
                            } else if (meta.type === "update") {
                                // Update the completion text
                                const deco = Decoration.widget(meta.pos, () => {
                                    const span = document.createElement("span");
                                    span.textContent = meta.text;
                                    span.classList.add("ai-completion-text");
                                    span.style.opacity = "0.7";
                                    span.style.borderRight = "1px solid currentColor";
                                    span.style.animation = "blink 1s infinite";
                                    return span;
                                });

                                return {
                                    ...prev,
                                    completionActive: true,
                                    completionText: meta.text,
                                    decorationSet: DecorationSet.create(tr.doc, [deco]),
                                };
                            } else if (meta.type === "finish") {
                                // Store the current placeholder content as the completion result for later acceptance
                                return {
                                    ...prev,
                                    completionActive: false,
                                    completionText: "",
                                    completionResult: {
                                        result: prev.placeholderContent,
                                        pos: prev.placeholderPos
                                    },
                                    decorationSet: DecorationSet.empty,
                                };
                            }
                        }

                        // Handle storing completion result (fallback for backward compatibility)
                        const completionResult = tr.getMeta('ai-completion-result');
                        if (completionResult) {
                            console.log('Storing completion result', completionResult);

                            return {
                                ...prev,
                                completionResult,
                                decorationSet: prev.decorationSet.map(tr.mapping, tr.doc),
                            };
                        }

                        // Handle regular transactions
                        return {
                            ...prev,
                            decorationSet: prev.decorationSet.map(tr.mapping, tr.doc),
                        };
                    },
                },
                props: {
                    decorations: (state) => {
                        return pluginKey.getState(state).decorationSet;
                    },
                },
                view: (view) => {
                    return {
                        update: (view) => {
                            // Update storage when view updates
                            const pluginState = pluginKey.getState(view.state);
                            if (view.state && this.editor && this.editor.storage) {
                                if (!this.editor.storage.aiCompletion) {
                                    this.editor.storage.aiCompletion = {};
                                }
                                this.editor.storage.aiCompletion.placeholderContent = pluginState.placeholderContent;
                                this.editor.storage.aiCompletion.placeholderPos = pluginState.placeholderPos;
                            }
                        },
                    };
                },
            }),
        ];
    },


});