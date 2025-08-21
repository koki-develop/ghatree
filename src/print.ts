import chalk from "chalk";
import type { Context } from "./context";
import type { Repository } from "./github";
import type { Node, RepositoryNode } from "./run";

const TREE_CHARS = {
  BRANCH: "├─",
  LAST_BRANCH: "└─",
  VERTICAL: "│  ",
  SPACE: "   ",
} as const;

function isSameRepository(
  a: Repository | undefined,
  b: Repository | undefined,
): boolean {
  if (!a || !b) return false;
  return a.owner === b.owner && a.name === b.name;
}

function getNodeLabel(context: Context, node: Node): string {
  switch (node.type) {
    case "repository":
      if (!node.repository) {
        return ".";
      }
      return `${node.repository.owner}/${node.repository.name}`;

    case "workflow":
      if (node.repository) {
        if (isSameRepository(context.repository, node.repository)) {
          const ref = node.ref ? `${chalk.gray(`@${node.ref}`)}` : "";
          return chalk.green(`./${node.path}`) + ref;
        } else {
          const repo = `${node.repository.owner}/${node.repository.name}`;
          const path = node.path ? `/${node.path}` : "";
          const ref = node.ref ? `${chalk.gray(`@${node.ref}`)}` : "";
          return chalk.green(`${repo}${path}`) + ref;
        }
      } else {
        return chalk.green(`./${node.path}`);
      }

    case "job":
      return `${chalk.yellow(node.path)}${node.dependencies.length === 0 ? ` ${chalk.gray("(no dependencies)")}` : ""}`;

    case "action": {
      if (node.path?.startsWith("docker://")) {
        const image = node.path.slice(9);
        const ref = node.ref ? `${chalk.gray(`:${node.ref}`)}` : "";
        return `docker://${image}${ref}`;
      }

      if (node.repository) {
        if (isSameRepository(context.repository, node.repository)) {
          const path = node.path ? `./${node.path}` : ".";
          const ref = node.ref ? `${chalk.gray(`@${node.ref}`)}` : "";
          return path + ref;
        } else {
          const repo = `${node.repository.owner}/${node.repository.name}`;
          const path = node.path ? `/${node.path}` : "";
          const ref = node.ref ? `${chalk.gray(`@${node.ref}`)}` : "";
          return `${repo}${path}${ref}`;
        }
      }
      if (node.path) {
        return `./${node.path}`;
      }
      return ".";
    }
  }
}

function printNode(
  context: Context,
  node: Node,
  prefix: string = "",
  isLast: boolean = true,
  isRoot: boolean = false,
): void {
  const label = getNodeLabel(context, node);

  if (isRoot) {
    console.log(label);
  } else {
    const branch = isLast ? TREE_CHARS.LAST_BRANCH : TREE_CHARS.BRANCH;
    console.log(`${prefix}${chalk.gray(branch)} ${label}`);
  }

  node.dependencies.forEach((child, index) => {
    const isLastChild = index === node.dependencies.length - 1;
    const extension = isLast
      ? TREE_CHARS.SPACE
      : chalk.gray(TREE_CHARS.VERTICAL);
    const newPrefix = isRoot ? "" : prefix + extension;

    printNode(context, child, newPrefix, isLastChild, false);
  });
}

export function treePrint(context: Context, node: RepositoryNode): void {
  printNode(context, node, "", true, true);
}
