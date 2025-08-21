import fs from "node:fs";
import path from "node:path";
import type { Context } from "./context";
import { fetchWorkflowDefinition, type WorkflowDefinition } from "./gha";

export type Repository = {
  owner: string;
  name: string;
};

type FetchContentParams = {
  repository: Repository | undefined;
  contentPath: string;
  ref: string | undefined;
};

export async function fetchContent(
  context: Context,
  params: FetchContentParams,
): Promise<string> {
  const { octokit } = context;

  if (!params.repository) {
    // read from local
    const filePath = path.join(process.cwd(), params.contentPath);
    return fs.readFileSync(filePath, "utf-8");
  }

  const response = await octokit.rest.repos.getContent({
    owner: params.repository.owner,
    repo: params.repository.name,
    path: params.contentPath,
    ref: params.ref,
  });

  if (Array.isArray(response.data)) {
    throw new Error(
      `Expected a file at ${params.contentPath} but found a directory or multiple files.`,
    );
  }

  if (response.data.type !== "file") {
    throw new Error(
      `Expected a file at ${params.contentPath} but found a ${response.data.type}.`,
    );
  }

  return Buffer.from(response.data.content, "base64").toString("utf-8");
}

export type FetchWorkflowsParams = {
  repository: Repository | undefined;
};

export async function fetchWorkflows(
  context: Context,
  params: FetchWorkflowsParams,
): Promise<WorkflowDefinition[]> {
  if (!params.repository) {
    const workflowsDir = path.join(process.cwd(), ".github/workflows");
    const files = fs.readdirSync(workflowsDir);
    return await Promise.all(
      files
        .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
        .map(async (file) => {
          return await fetchWorkflowDefinition(context, {
            repository: undefined,
            workflowPath: path.join(".github/workflows", file),
            ref: undefined,
          });
        }),
    );
  }

  const { octokit } = context;
  const response = await octokit.paginate(
    "GET /repos/{owner}/{repo}/actions/workflows",
    {
      owner: params.repository.owner,
      repo: params.repository.name,
    },
  );

  return (
    await Promise.all(
      response
        .filter((workflow) => workflow.path.startsWith(".github/workflows"))
        .map(async (workflow) => {
          return await fetchWorkflowDefinition(context, {
            repository: params.repository,
            workflowPath: workflow.path,
            ref: undefined,
          }).catch((err) => {
            if (err.status === 404) {
              return null;
            }
            throw err;
          });
        }),
    )
  ).filter((workflow): workflow is WorkflowDefinition => {
    return workflow !== null;
  });
}
