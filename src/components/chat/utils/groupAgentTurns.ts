import type { ChatMessage } from '../types/types';

export interface UserItem {
  kind: 'user';
  message: ChatMessage;
}

export interface StandaloneItem {
  kind: 'standalone';
  message: ChatMessage;
}

export interface AgentTurnItem {
  kind: 'agent-turn';
  textMessages: ChatMessage[];
  intermediateMessages: ChatMessage[];
  /** All messages in original order (used for streaming flat view) */
  allMessages: ChatMessage[];
  toolCount: number;
  toolNames: string[];
  isActivelyStreaming: boolean;
}

export type GroupedItem = UserItem | StandaloneItem | AgentTurnItem;

/**
 * Groups chat messages into agent turns.
 * Messages between two user messages form a single agent turn.
 * All pure-text assistant messages are extracted as `textMessages` and shown directly;
 * tool calls and thinking are `intermediateMessages` (collapsed by default).
 */
export function groupMessagesIntoTurns(
  messages: ChatMessage[],
  isLoading: boolean
): GroupedItem[] {
  const items: GroupedItem[] = [];
  let currentTurnMessages: ChatMessage[] = [];

  const flushTurn = (isLastTurn: boolean) => {
    if (currentTurnMessages.length === 0) return;

    const activelyStreaming = isLastTurn && isLoading;

    // Find all assistant messages that are pure text (not tool use, not thinking-only)
    const isTextMessage = (msg: ChatMessage) =>
      msg.type === 'assistant' &&
      !msg.isToolUse &&
      !msg.isThinking &&
      msg.content &&
      msg.content.trim().length > 0;

    const textIndices = new Set<number>();
    for (let i = 0; i < currentTurnMessages.length; i++) {
      if (isTextMessage(currentTurnMessages[i])) {
        textIndices.add(i);
      }
    }

    const toolNames: string[] = [];
    const toolNamesSet = new Set<string>();
    let toolCount = 0;

    for (const msg of currentTurnMessages) {
      if (msg.isToolUse && msg.toolName) {
        toolCount++;
        if (!toolNamesSet.has(msg.toolName)) {
          toolNamesSet.add(msg.toolName);
          toolNames.push(msg.toolName);
        }
      }
    }

    // If there's only one message and it's a text message, standalone
    if (
      currentTurnMessages.length === 1 &&
      textIndices.has(0) &&
      toolCount === 0
    ) {
      items.push({ kind: 'standalone', message: currentTurnMessages[0] });
      currentTurnMessages = [];
      return;
    }

    const textMessages = currentTurnMessages.filter((_, i) => textIndices.has(i));
    const intermediateMessages = currentTurnMessages.filter((_, i) => !textIndices.has(i));

    items.push({
      kind: 'agent-turn',
      textMessages,
      intermediateMessages,
      allMessages: [...currentTurnMessages],
      toolCount,
      toolNames,
      isActivelyStreaming: activelyStreaming,
    });

    currentTurnMessages = [];
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type === 'user' && !msg.isSkillContent) {
      flushTurn(false);
      items.push({ kind: 'user', message: msg });
    } else {
      currentTurnMessages.push(msg);
    }
  }

  // Flush remaining non-user messages as the last turn
  flushTurn(true);

  return items;
}
