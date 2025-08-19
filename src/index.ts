import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { type Input, run } from "./main";

const program = new Command();

type Options = {
  repo: string;
};

function parseOptions(options: Options): Input {
  const input: Input = {
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
    input.repository = { owner: parts[0]!, name: parts[1]! };
  }

  return input;
}

program
  .name("ghatree")
  .version(packageJson.version)
  .option("--repo <repository>", "GitHub repository in owner/repo format")
  .action(async () => {
    const options = program.opts<Options>();
    const input = parseOptions(options);
    const nodes = await run(input);

    // TODO: tree
    console.log(JSON.stringify(nodes, null, 2));
  });

program.parse(process.argv);
