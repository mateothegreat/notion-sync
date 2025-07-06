/**
 * Notion Objects Domain Models
 *
 * Domain models for Notion API objects
 */

import {
  Entity,
  NotionObject,
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionUser,
  NotionParent,
  NotionProperty
} from "../../shared/types";
import { ValidationError } from "../../shared/errors";

// Base Notion Object
export abstract class BaseNotionObject implements Entity {
  public readonly id: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(
    id: string,
    public readonly notionId: string,
    public readonly type: string,
    public readonly createdTime: Date,
    public readonly lastEditedTime: Date,
    public readonly createdBy: NotionUser,
    public readonly lastEditedBy: NotionUser,
    createdAt?: Date,
    updatedAt?: Date
  ) {
    this.id = id;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();

    this.validate();
  }

  protected validate(): void {
    if (!this.notionId) {
      throw new ValidationError("Notion ID is required");
    }
    if (!this.type) {
      throw new ValidationError("Type is required");
    }
  }

  abstract toNotionObject(): NotionObject;
}

// Page Domain Model
export class Page extends BaseNotionObject {
  constructor(
    id: string,
    notionId: string,
    public readonly title: string,
    public readonly properties: Record<string, any>,
    public readonly parent: NotionParent,
    public readonly url: string,
    public readonly archived: boolean,
    createdTime: Date,
    lastEditedTime: Date,
    createdBy: NotionUser,
    lastEditedBy: NotionUser,
    createdAt?: Date,
    updatedAt?: Date
  ) {
    super(id, notionId, "page", createdTime, lastEditedTime, createdBy, lastEditedBy, createdAt, updatedAt);
  }

  protected validate(): void {
    super.validate();
    if (!this.title) {
      throw new ValidationError("Page title is required");
    }
    if (!this.url) {
      throw new ValidationError("Page URL is required");
    }
  }

  toNotionObject(): NotionPage {
    return {
      id: this.notionId,
      type: "page" as any,
      title: this.title,
      properties: this.properties,
      parent: this.parent,
      url: this.url,
      archived: this.archived,
      createdTime: this.createdTime.toISOString(),
      lastEditedTime: this.lastEditedTime.toISOString(),
      createdBy: this.createdBy,
      lastEditedBy: this.lastEditedBy
    };
  }

  hasParentDatabase(): boolean {
    return this.parent.type === "database_id";
  }

  hasParentPage(): boolean {
    return this.parent.type === "page_id";
  }

  getParentId(): string | null {
    return this.parent.database_id || this.parent.page_id || null;
  }

  isArchived(): boolean {
    return this.archived;
  }

  getPropertyValue(propertyName: string): any {
    return this.properties[propertyName];
  }

  hasProperty(propertyName: string): boolean {
    return propertyName in this.properties;
  }
}

// Database Domain Model
export class Database extends BaseNotionObject {
  constructor(
    id: string,
    notionId: string,
    public readonly title: string,
    public readonly description: string,
    public readonly properties: Record<string, NotionProperty>,
    public readonly parent: NotionParent,
    public readonly url: string,
    public readonly archived: boolean,
    createdTime: Date,
    lastEditedTime: Date,
    createdBy: NotionUser,
    lastEditedBy: NotionUser,
    createdAt?: Date,
    updatedAt?: Date
  ) {
    super(id, notionId, "database", createdTime, lastEditedTime, createdBy, lastEditedBy, createdAt, updatedAt);
  }

  protected validate(): void {
    super.validate();
    if (!this.title) {
      throw new ValidationError("Database title is required");
    }
    if (!this.url) {
      throw new ValidationError("Database URL is required");
    }
  }

  toNotionObject(): NotionDatabase {
    return {
      id: this.notionId,
      type: "database" as any,
      title: this.title,
      description: this.description,
      properties: this.properties,
      parent: this.parent,
      url: this.url,
      archived: this.archived,
      createdTime: this.createdTime.toISOString(),
      lastEditedTime: this.lastEditedTime.toISOString(),
      createdBy: this.createdBy,
      lastEditedBy: this.lastEditedBy
    };
  }

  getPropertyNames(): string[] {
    return Object.keys(this.properties);
  }

  getProperty(name: string): NotionProperty | null {
    return this.properties[name] || null;
  }

  hasProperty(name: string): boolean {
    return name in this.properties;
  }

  getPropertyByType(type: string): NotionProperty[] {
    return Object.values(this.properties).filter((prop) => prop.type === type);
  }

  isArchived(): boolean {
    return this.archived;
  }
}

// Block Domain Model
export class Block extends BaseNotionObject {
  constructor(
    id: string,
    notionId: string,
    public readonly blockType: string,
    public readonly hasChildren: boolean,
    public readonly archived: boolean,
    public readonly content: Record<string, any>,
    createdTime: Date,
    lastEditedTime: Date,
    createdBy: NotionUser,
    lastEditedBy: NotionUser,
    public readonly children: Block[] = [],
    createdAt?: Date,
    updatedAt?: Date
  ) {
    super(id, notionId, "block", createdTime, lastEditedTime, createdBy, lastEditedBy, createdAt, updatedAt);
  }

  protected validate(): void {
    super.validate();
    if (!this.blockType) {
      throw new ValidationError("Block type is required");
    }
  }

  toNotionObject(): NotionBlock {
    return {
      id: this.notionId,
      type: "block" as any,
      blockType: this.blockType,
      hasChildren: this.hasChildren,
      archived: this.archived,
      content: this.content,
      createdTime: this.createdTime.toISOString(),
      lastEditedTime: this.lastEditedTime.toISOString(),
      createdBy: this.createdBy,
      lastEditedBy: this.lastEditedBy
    };
  }

  addChild(child: Block): void {
    this.children.push(child);
  }

  removeChild(childId: string): void {
    const index = this.children.findIndex((child) => child.id === childId);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
  }

  getChildrenCount(): number {
    return this.children.length;
  }

  getAllDescendants(): Block[] {
    const descendants: Block[] = [];

    for (const child of this.children) {
      descendants.push(child);
      descendants.push(...child.getAllDescendants());
    }

    return descendants;
  }

  isTextBlock(): boolean {
    return ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item"].includes(
      this.blockType
    );
  }

  isMediaBlock(): boolean {
    return ["image", "video", "file", "pdf", "audio"].includes(this.blockType);
  }

  isContainerBlock(): boolean {
    return ["column_list", "column", "toggle", "quote", "callout"].includes(this.blockType);
  }

  getText(): string {
    if (!this.isTextBlock()) return "";

    const textContent = this.content[this.blockType];
    if (!textContent || !textContent.rich_text) return "";

    return textContent.rich_text.map((text: any) => text.plain_text || "").join("");
  }
}

// Factories
export class NotionObjectFactory {
  static createPage(notionPage: NotionPage): Page {
    return new Page(
      crypto.randomUUID(),
      notionPage.id,
      notionPage.title,
      notionPage.properties,
      notionPage.parent,
      notionPage.url,
      notionPage.archived,
      new Date(notionPage.createdTime),
      new Date(notionPage.lastEditedTime),
      notionPage.createdBy,
      notionPage.lastEditedBy
    );
  }

  static createDatabase(notionDatabase: NotionDatabase): Database {
    return new Database(
      crypto.randomUUID(),
      notionDatabase.id,
      notionDatabase.title,
      notionDatabase.description,
      notionDatabase.properties,
      notionDatabase.parent,
      notionDatabase.url,
      notionDatabase.archived,
      new Date(notionDatabase.createdTime),
      new Date(notionDatabase.lastEditedTime),
      notionDatabase.createdBy,
      notionDatabase.lastEditedBy
    );
  }

  static createBlock(notionBlock: NotionBlock): Block {
    return new Block(
      crypto.randomUUID(),
      notionBlock.id,
      notionBlock.blockType,
      notionBlock.hasChildren,
      notionBlock.archived,
      notionBlock.content,
      new Date(notionBlock.createdTime),
      new Date(notionBlock.lastEditedTime),
      notionBlock.createdBy,
      notionBlock.lastEditedBy
    );
  }
}

// Repository Interfaces
export interface PageRepository {
  save(page: Page): Promise<void>;
  findById(id: string): Promise<Page | null>;
  findByNotionId(notionId: string): Promise<Page | null>;
  findByParent(parentId: string): Promise<Page[]>;
  delete(id: string): Promise<void>;
}

export interface DatabaseRepository {
  save(database: Database): Promise<void>;
  findById(id: string): Promise<Database | null>;
  findByNotionId(notionId: string): Promise<Database | null>;
  findAll(): Promise<Database[]>;
  delete(id: string): Promise<void>;
}

export interface BlockRepository {
  save(block: Block): Promise<void>;
  findById(id: string): Promise<Block | null>;
  findByNotionId(notionId: string): Promise<Block | null>;
  findByParent(parentId: string): Promise<Block[]>;
  saveWithChildren(block: Block): Promise<void>;
  delete(id: string): Promise<void>;
}
