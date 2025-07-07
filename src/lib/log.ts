import { bgBlack, bgBlue, bgGray, greenBright, red, yellow } from "ansis";
import { inspect as nodeInspect } from "util";

export namespace log {
  export namespace debugging {
    export const inspect = (label: string, args: any) => {
      console.log(`${new Date().toISOString()} 🐛 ${bgGray(label)}`);
      console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
    };
  }

  export const info = (message: string, args?: any) => {
    console.log(`${new Date().toISOString()} ℹ️ ${bgBlue(message)}`);
    if (args) {
      console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
    }
  };

  export const debug = (message: string, args: any) => {
    console.log(`${new Date().toISOString()} 🐛 ${bgGray(message)}`);
    console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
  };

  export const trace = (message: string, args: any) => {
    console.log(`${new Date().toISOString()} 🔍 ${bgBlack(message)}`);
    console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
  };

  export const success = (message: string, args?: any) => {
    console.log(`${new Date().toISOString()} ✅ ${greenBright(message)}`);
    if (args) {
      console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
    }
  };

  export const warning = (message: string, args?: any) => {
    console.log(`${new Date().toISOString()} ⚠️ ${yellow(message)}`);
    if (args) {
      console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
    }
  };

  export const error = (message: string, args?: any) => {
    console.log(`${new Date().toISOString()} ❌ ${red(message)}`);
    if (args) {
      console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
    }
  };

  export const fatal = (message: string, args?: any) => {
    console.log(`${new Date().toISOString()} ☠️ ${red(message)}`);
    if (args) {
      console.log(nodeInspect(args, { depth: null, colors: true, sorted: true }));
    }
    process.exit(1);
  };
}
