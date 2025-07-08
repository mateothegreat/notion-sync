export const date = new Date();

export enum OrganizationStrategy {
  FLAT = "flat",
  TYPE = "type",
  HIERARCHICAL = "hierarchical"
}

export const strategies: { [key in OrganizationStrategy]: { description: string } } = {
  [OrganizationStrategy.FLAT]: {
    description: "Flat organization strategy"
  },
  [OrganizationStrategy.HIERARCHICAL]: {
    description: "Hierarchical organization strategy"
  },
  [OrganizationStrategy.TYPE]: {
    description: "By type organization strategy"
  }
};
