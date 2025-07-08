import type {
  AudioBlockObjectResponse,
  BlockObjectResponse,
  BreadcrumbBlockObjectResponse,
  ColumnBlockObjectResponse,
  ColumnListBlockObjectResponse,
  EquationBlockObjectResponse,
  LinkPreviewBlockObjectResponse,
  LinkToPageBlockObjectResponse,
  ListBlockChildrenResponse,
  PartialBlockObjectResponse,
  SyncedBlockBlockObjectResponse,
  TableOfContentsBlockObjectResponse,
  TemplateBlockObjectResponse,
  UnsupportedBlockObjectResponse
} from "@notionhq/client/build/src/api-endpoints";
import { NotionObject, NotionObjectType } from "./object";

/**
 * Represents the union of all possible block types returned from the Notion API.
 *
 * @remarks
 * This type represents the comprehensive union of all block object responses,
 * including both full and partial responses. This ensures we handle all possible
 * block types that Notion's API might return, providing complete type coverage.
 *
 * @see {@link https://developers.notion.com/reference/block | Notion Block Reference}
 */
export type NotionBlockUnion = BlockObjectResponse | PartialBlockObjectResponse;

/**
 * Type representing a full block object response from Notion.
 *
 * @remarks
 * This type excludes partial block responses and only includes complete block
 * objects with all their properties. Use this when you need to work with
 * blocks that have been fully retrieved from the API.
 */
export type NotionFullBlock = BlockObjectResponse;

/**
 * Type representing a partial block object response from Notion.
 *
 * @remarks
 * Partial blocks are returned in certain API responses where not all block
 * data is included. These typically contain only the essential properties.
 */
export type NotionPartialBlock = PartialBlockObjectResponse;

/**
 * Extract specific block types from the union based on their type property.
 *
 * @remarks
 * These types use TypeScript's Extract utility to filter the BlockObjectResponse
 * union by the specific block type. This provides type-safe access to block-specific
 * properties without requiring type guards or casting.
 *
 * @example
 * ```typescript
 * const paragraphBlock: NotionParagraphBlock = {
 *   // TypeScript knows this must have paragraph-specific properties
 *   type: "paragraph",
 *   paragraph: { rich_text: [...] }
 *   // ...
 * };
 * ```
 */
export type NotionParagraphBlock = Extract<BlockObjectResponse, { type: "paragraph" }>;
export type NotionHeading1Block = Extract<BlockObjectResponse, { type: "heading_1" }>;
export type NotionHeading2Block = Extract<BlockObjectResponse, { type: "heading_2" }>;
export type NotionHeading3Block = Extract<BlockObjectResponse, { type: "heading_3" }>;
export type NotionBulletedListItemBlock = Extract<BlockObjectResponse, { type: "bulleted_list_item" }>;
export type NotionNumberedListItemBlock = Extract<BlockObjectResponse, { type: "numbered_list_item" }>;
export type NotionQuoteBlock = Extract<BlockObjectResponse, { type: "quote" }>;
export type NotionToDoBlock = Extract<BlockObjectResponse, { type: "to_do" }>;
export type NotionToggleBlock = Extract<BlockObjectResponse, { type: "toggle" }>;
export type NotionCodeBlock = Extract<BlockObjectResponse, { type: "code" }>;
export type NotionCalloutBlock = Extract<BlockObjectResponse, { type: "callout" }>;
export type NotionDividerBlock = Extract<BlockObjectResponse, { type: "divider" }>;
export type NotionTableBlock = Extract<BlockObjectResponse, { type: "table" }>;
export type NotionTableRowBlock = Extract<BlockObjectResponse, { type: "table_row" }>;
export type NotionImageBlock = Extract<BlockObjectResponse, { type: "image" }>;
export type NotionVideoBlock = Extract<BlockObjectResponse, { type: "video" }>;
export type NotionFileBlock = Extract<BlockObjectResponse, { type: "file" }>;
export type NotionPdfBlock = Extract<BlockObjectResponse, { type: "pdf" }>;
export type NotionBookmarkBlock = Extract<BlockObjectResponse, { type: "bookmark" }>;
export type NotionEmbedBlock = Extract<BlockObjectResponse, { type: "embed" }>;
export type NotionChildPageBlock = Extract<BlockObjectResponse, { type: "child_page" }>;
export type NotionChildDatabaseBlock = Extract<BlockObjectResponse, { type: "child_database" }>;

/**
 * A type-level map that associates block type strings with their corresponding
 * TypeScript types.
 *
 * @remarks
 * This mapping enables conditional type logic to determine the exact block type
 * based on a string literal. It's particularly useful for creating type-safe
 * factory functions or transformers that need to return specific block types
 * based on runtime values.
 */
export type NotionBlockTypeMap = {
  paragraph: NotionParagraphBlock;
  heading_1: NotionHeading1Block;
  heading_2: NotionHeading2Block;
  heading_3: NotionHeading3Block;
  bulleted_list_item: NotionBulletedListItemBlock;
  numbered_list_item: NotionNumberedListItemBlock;
  quote: NotionQuoteBlock;
  to_do: NotionToDoBlock;
  toggle: NotionToggleBlock;
  template: TemplateBlockObjectResponse;
  synced_block: SyncedBlockBlockObjectResponse;
  child_page: NotionChildPageBlock;
  child_database: NotionChildDatabaseBlock;
  equation: EquationBlockObjectResponse;
  code: NotionCodeBlock;
  callout: NotionCalloutBlock;
  divider: NotionDividerBlock;
  breadcrumb: BreadcrumbBlockObjectResponse;
  table_of_contents: TableOfContentsBlockObjectResponse;
  column_list: ColumnListBlockObjectResponse;
  column: ColumnBlockObjectResponse;
  link_to_page: LinkToPageBlockObjectResponse;
  table: NotionTableBlock;
  table_row: NotionTableRowBlock;
  embed: NotionEmbedBlock;
  bookmark: NotionBookmarkBlock;
  image: NotionImageBlock;
  video: NotionVideoBlock;
  pdf: NotionPdfBlock;
  file: NotionFileBlock;
  audio: AudioBlockObjectResponse;
  link_preview: LinkPreviewBlockObjectResponse;
  unsupported: UnsupportedBlockObjectResponse;
};

/**
 * Union type of all supported block type strings.
 *
 * @remarks
 * This type is derived from the keys of NotionBlockTypeMap and represents
 * all block types that Notion's API currently supports.
 */
export type NotionBlockType = keyof NotionBlockTypeMap;

/**
 * Conditional type that extracts the specific block type based on a type parameter.
 *
 * @typeParam T - The block type string literal
 *
 * @example
 * ```typescript
 * type ParagraphBlock = NotionBlockOfType<"paragraph">; // NotionParagraphBlock
 * type HeadingBlock = NotionBlockOfType<"heading_1">; // NotionHeading1Block
 * ```
 */
export type NotionBlockOfType<T extends NotionBlockType> = NotionBlockTypeMap[T];

/**
 * Our internal representation of a Notion block.
 *
 * @remarks
 * This interface extends the base NotionObject and adds block-specific properties.
 * It provides a normalized structure for working with blocks in our application,
 * abstracting away some of the complexity of the raw Notion API responses.
 */
export interface NotionBlock extends NotionObject {
  type: NotionObjectType.BLOCK;
  blockType: string;
  hasChildren: boolean;
  archived: boolean;
  content: Record<string, any>;
}

/**
 * Type-safe response for listing block children.
 *
 * @remarks
 * This type enhances the standard ListBlockChildrenResponse by providing
 * precise typing for the results array based on any filtering or transformation
 * applied in our application layer.
 */
export type NotionBlockChildrenResponse = Omit<ListBlockChildrenResponse, "results"> & {
  results: NotionBlock[];
};

/**
 * Type guard to check if a block response is a full block.
 *
 * @param block - The block to check
 * @returns True if the block is a full BlockObjectResponse
 */
export function isFullBlock(block: NotionBlockUnion): block is NotionFullBlock {
  return block.object === "block" && "type" in block;
}

/**
 * Type guard to check if a block response is a partial block.
 *
 * @param block - The block to check
 * @returns True if the block is a PartialBlockObjectResponse
 */
export function isPartialBlock(block: NotionBlockUnion): block is NotionPartialBlock {
  return block.object === "block" && !("type" in block);
}

/**
 * Type guard to check if a block has children.
 *
 * @param block - The block to check
 * @returns True if the block has children
 */
export function hasChildren(block: NotionBlockUnion): boolean {
  if (isFullBlock(block)) {
    return block.has_children || false;
  }
  return false;
}
