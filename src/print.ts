import chalk from "chalk";
import type { Node, RepositoryNode } from "./run";

const TREE_CHARS = {
  BRANCH: "├─",
  LAST_BRANCH: "└─",
  VERTICAL: "│  ",
  SPACE: "   ",
} as const;

function getNodeLabel(node: Node): string {
  switch (node.type) {
    case "repository":
      if (!node.repository) {
        return ".";
      }
      return `${node.repository.owner}/${node.repository.name}`;

    case "workflow":
      if (node.repository) {
        const repo = `${node.repository.owner}/${node.repository.name}`;
        const path = node.path ? `/${node.path}` : "";
        const ref = node.ref ? `${chalk.gray(`@${node.ref}`)}` : "";
        return chalk.green(`${repo}${path}`) + ref;
      } else {
        return chalk.green(`./${node.path}`);
      }

    case "job":
      return chalk.yellow(node.name);

    case "action": {
      if (node.repository) {
        const repo = `${node.repository.owner}/${node.repository.name}`;
        const path = node.path ? `/${node.path}` : "";
        const ref = node.ref ? `${chalk.gray(`@${node.ref}`)}` : "";
        return `${repo}${path}${ref}`;
      }
      if (node.path) {
        return `./${node.path}`;
      }
      return ".";
    }
  }
}

function printNode(
  node: Node,
  prefix: string = "",
  isLast: boolean = true,
  isRoot: boolean = false,
): void {
  const label = getNodeLabel(node);

  if (isRoot) {
    console.log(label);
  } else {
    const branch = isLast ? TREE_CHARS.LAST_BRANCH : TREE_CHARS.BRANCH;
    console.log(`${prefix}${chalk.gray(branch)} ${label}`);
  }

  node.children.forEach((child, index) => {
    const isLastChild = index === node.children.length - 1;
    const extension = isLast
      ? TREE_CHARS.SPACE
      : chalk.gray(TREE_CHARS.VERTICAL);
    const newPrefix = isRoot ? "" : prefix + extension;

    printNode(child, newPrefix, isLastChild, false);
  });
}

export function treePrint(node: RepositoryNode): void {
  printNode(node, "", true, true);
}
