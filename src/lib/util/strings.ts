export namespace strings {
  export const snakeToKebab = (s: string) => s.replaceAll("_", "-");
  export const pluralize = (s: string) => `${s}s`;
  export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  export const kebabToTitle = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
