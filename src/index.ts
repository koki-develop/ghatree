import { Command } from "commander";
import { Octokit } from "octokit";
import packageJson from "../package.json" with { type: "json" };
import type { Context } from "./context";
import { treePrint } from "./print";
import { run } from "./run";

const program = new Command();

type Options = {
  repo: string;
  json: boolean;
};

function initializeContext(options: Options): Context {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    throttle: { enabled: false },
  });

  const context: Context = {
    octokit,
    repository: undefined,
  };

  // --repo
  if (options.repo) {
    const parts = options.repo.split("/");
    if (parts.length !== 2) {
      throw new Error(
        `Invalid repository format: ${options.repo}. Expected format: owner/repo`,
      );
    }
    context.repository = { owner: parts[0]!, name: parts[1]! };
  }

  return context;
}

program
  .name("ghatree")
  .version(packageJson.version)
  .description(
    "Visualize GitHub Actions workflow dependencies as a tree structure.",
  )
  .option("--repo <repository>", "GitHub repository in owner/repo format")
  .option("--json", "Output in JSON format")
  .action(async () => {
    const options = program.opts<Options>();
    const context = initializeContext(options);

    const node = await run(context);

    if (options.json) {
      console.log(JSON.stringify(node, null, 2));
    } else {
      treePrint(context, node);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  if (process.env.DEBUG === "true") {
    console.error(err);
  } else {
    console.error(String(err));
  }
  process.exit(1);
});
