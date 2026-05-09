// ═══════════════════════════════════════════════════════
// @mention parser and context resolver
// ═══════════════════════════════════════════════════════
import type { MentionContext, ResolvedContext } from './types';
import { state } from '../core/types/state';

export class MentionParser {
  private static MENTION_REGEX = /@(\w+):([^\s]+)/g;

  /**
   * Parse @mentions from input text
   * Supported formats:
   * - @card:123 - Reference card by ID
   * - @file:path/to/file - Reference external file
   * - @group:name - Reference card group
   */
  static parse(input: string): MentionContext[] {
    const mentions: MentionContext[] = [];
    let match;

    // Reset regex state
    this.MENTION_REGEX.lastIndex = 0;

    while ((match = this.MENTION_REGEX.exec(input)) !== null) {
      const [fullMatch, type, ref] = match;
      mentions.push({
        type,
        ref,
        fullMatch,
        startIndex: match.index,
        endIndex: match.index + fullMatch.length
      });
    }

    return mentions;
  }

  /**
   * Resolve mentions to actual context data
   */
  static async resolve(mentions: MentionContext[]): Promise<ResolvedContext[]> {
    const resolved: ResolvedContext[] = [];

    for (const mention of mentions) {
      try {
        switch (mention.type) {
          case 'card':
            const cardContext = this.resolveCard(mention.ref);
            if (cardContext) resolved.push(cardContext);
            break;

          case 'file':
            const fileContext = await this.resolveFile(mention.ref);
            if (fileContext) resolved.push(fileContext);
            break;

          case 'group':
            const groupContext = this.resolveGroup(mention.ref);
            if (groupContext) resolved.push(groupContext);
            break;

          default:
            console.warn(`Unknown mention type: ${mention.type}`);
        }
      } catch (error) {
        console.error(`Failed to resolve mention ${mention.fullMatch}:`, error);
      }
    }

    return resolved;
  }

  /**
   * Resolve @card:ID mention
   */
  private static resolveCard(ref: string): ResolvedContext | null {
    const cardId = parseInt(ref);
    if (isNaN(cardId)) return null;

    const card = state.cards.find(c => c.id === cardId);
    if (!card) return null;

    // Get connected cards
    const connections = state.connections.filter(
      c => c.from === cardId || c.to === cardId
    );

    return {
      type: 'card',
      content: `Card #${card.id}: ${card.text}`,
      metadata: {
        id: card.id,
        source: card.source,
        connections: connections.length
      }
    };
  }

  /**
   * Resolve @file:path mention
   */
  private static async resolveFile(ref: string): Promise<ResolvedContext | null> {
    try {
      // TODO: Implement file reading API
      // For now, return placeholder
      return {
        type: 'file',
        content: `File: ${ref}`,
        metadata: {
          path: ref
        }
      };
    } catch (error) {
      console.error(`Failed to read file ${ref}:`, error);
      return null;
    }
  }

  /**
   * Resolve @group:name mention
   */
  private static resolveGroup(ref: string): ResolvedContext | null {
    const group = state.groups.find(g => g.name === ref);
    if (!group) return null;

    const cards = group.cardIds
      .map(id => state.cards.find(c => c.id === id))
      .filter(Boolean);

    return {
      type: 'group',
      content: `Group "${group.name}" with ${cards.length} cards:\n` +
        cards.map(c => `- #${c!.id}: ${c!.text.slice(0, 50)}`).join('\n'),
      metadata: {
        name: group.name,
        cardCount: cards.length,
        cardIds: group.cardIds
      }
    };
  }

  /**
   * Build context string for LLM
   */
  static buildContextString(resolved: ResolvedContext[]): string {
    if (resolved.length === 0) return '';

    return '\n\n引用的上下文：\n' +
      resolved.map((ctx, i) => `${i + 1}. ${ctx.content}`).join('\n\n');
  }

  /**
   * Remove mentions from input text
   */
  static stripMentions(input: string): string {
    return input.replace(this.MENTION_REGEX, '').trim();
  }
}
