import { Hook } from "@oclif/core";

/**
 * Init hook that runs during CLI initialization.
 * This hook runs before commands are executed and can be used for setup.
 */
const hook: Hook.Init = async function ({ argv }) {
  console.log("init", argv);
};

export default hook;
