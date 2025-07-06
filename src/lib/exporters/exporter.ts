import { Format } from "../renderers/format";

export type ExporterConfig = {
  format: Format;
};

export class Exporter {
  format: Format;

  constructor(private config: ExporterConfig) {
    this.format = config.format;
  }
}
