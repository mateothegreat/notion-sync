export namespace organization {
  const date = new Date();

  export enum strategy {
    FLAT = "flat",
    TYPE = "type",
    HIERARCHICAL = "hierarchical"
  }

  export const strategies: { [key in strategy]: { description: string } } = {
    [strategy.FLAT]: {
      description: "Flat organization strategy"
    },
    [strategy.HIERARCHICAL]: {
      description: "Hierarchical organization strategy"
    },
    [strategy.TYPE]: {
      description: "By type organization strategy"
    }
  };
}
