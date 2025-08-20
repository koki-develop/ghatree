import type { Octokit } from "octokit";
import type { Repository } from "./github";

export type Context = {
  octokit: Octokit;
  repository: Repository | undefined;
};
