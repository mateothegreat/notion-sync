import { bgBlack, bgBlue, bgGray, red } from "ansis";
import { inspect as nodeInspect } from "util";

export namespace log {
  export namespace debugging {
    export const inspect = (label: string, args: any) => {
      console.log(bgGray(label));
      console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
    };
  }

  export const info = (message: string, args?: any) => {
    console.log(bgBlue(message));
    if (args) {
      console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
    }
  };

  export const debug = (message: string, args: any) => {
    console.log(bgGray(message));
    console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
  };

  export const error = (message: string, error: any) => {
    console.error(red(message));
    console.error(red(nodeInspect(error, { depth: null, colors: true, sorted: true })));
  };

  export const trace = (message: string, args: any) => {
    console.log(bgBlack(message));
    console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
  };
}
