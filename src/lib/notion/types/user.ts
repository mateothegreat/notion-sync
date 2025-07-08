export interface NotionUser {
  id: string;
  type: "person" | "bot";
  name?: string;
  avatarUrl?: string;
  email?: string;
}
