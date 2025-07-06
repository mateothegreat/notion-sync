import { bgGray, red } from "ansis";
import { inspect as nodeInspect } from "util";

export namespace log {
  export namespace debug {
    export const inspect = (label: string, args: any) => {
      console.log(bgGray(label));
      console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
    };
  }

  export const error = (message: string, error: any) => {
    console.error(red(message));
    console.error(red(nodeInspect(error, { depth: null, colors: true, sorted: true })));
  };
}
