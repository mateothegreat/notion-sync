export const date = new Date();

export enum OrganizationStrategy {
  FLAT = "flat",
  HIERARCHICAL = "hierarchical",
  BY_TYPE = "by-type",
  BY_DATE = "by-date"
}

export const strategies: { [key in OrganizationStrategy]: { description: string } } = {
  [OrganizationStrategy.FLAT]: {
    description: "Flat organization strategy"
  },
  [OrganizationStrategy.HIERARCHICAL]: {
    description: "Hierarchical organization strategy"
  },
  [OrganizationStrategy.BY_TYPE]: {
    description: "By type organization strategy"
  },
  [OrganizationStrategy.BY_DATE]: {
    description: "By date organization strategy"
  }
};
