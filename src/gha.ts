import path from "node:path";
import * as yaml from "yaml";
import type { Context } from "./context";
import { fetchContent, type Repository } from "./github";

export type WorkflowDefinition = {
  jobs: Record<string, WorkflowJob>;
};

export type ActionDefinition = {
  runs: {
    using: string;
    steps: Step[];
  };
};

export type WorkflowJob = {
  uses: string | undefined;
  steps: Step[] | undefined;
};

export type Step = {
  uses: string | undefined;
};

export type ActionUses = {
  repository: Repository | undefined;
  path: string | undefined;
  ref: string | undefined;
};

export type FetchWorkflowDefinitionParams = {
  repository: Repository | undefined;
  workflowPath: string;
  ref: string | undefined;
};

const workflowDefinitionCaches = new Map<string, WorkflowDefinition>();

export async function fetchWorkflowDefinition(
  context: Context,
  params: FetchWorkflowDefinitionParams,
): Promise<WorkflowDefinition> {
  const cacheKey = JSON.stringify(params);
  if (workflowDefinitionCaches.has(cacheKey)) {
    return workflowDefinitionCaches.get(cacheKey)!;
  }

  const content = await fetchContent(context, {
    repository: params.repository,
    contentPath: params.workflowPath,
    ref: params.ref,
  });

  // TODO: validate schema
  const workflowDefinition = yaml.parse(content) as WorkflowDefinition;

  workflowDefinitionCaches.set(cacheKey, workflowDefinition);
  return workflowDefinition;
}

export type FetchActionDefinitionParams = {
  repository: Repository | undefined;
  actionPath: string | undefined;
  ref: string | undefined;
};

const actionDefinitionCache = new Map<string, ActionDefinition>();

export async function fetchActionDefinition(
  context: Context,
  params: FetchActionDefinitionParams,
): Promise<ActionDefinition> {
  const cacheKey = JSON.stringify(params);
  if (actionDefinitionCache.has(cacheKey)) {
    return actionDefinitionCache.get(cacheKey)!;
  }

  const errors: Error[] = [];

  for (const actionYml of ["action.yml", "action.yaml"]) {
    const contentPath = params.actionPath
      ? path.join(params.actionPath, actionYml)
      : actionYml;

    const content = await fetchContent(context, {
      repository: params.repository,
      contentPath,
      ref: params.ref,
    }).catch((err) => {
      errors.push(err);
      return null;
    });
    if (content == null) {
      continue; // try next actionYml
    }

    // TODO: validate schema
    const actionDefinition = yaml.parse(content) as ActionDefinition;

    actionDefinitionCache.set(cacheKey, actionDefinition);
    return actionDefinition;
  }

  const action = [
    params.repository?.owner,
    params.repository?.name,
    params.actionPath,
  ]
    .filter((p) => p != null)
    .join("/");
  const actionWithRef = params.ref ? `${action}@${params.ref}` : action;
  throw new Error(
    `Failed to fetch action definition from ${actionWithRef}: ${errors.map((e) => e.message).join(", ")}`,
  );
}

export type ParseUsesParams = {
  str: string;
  workingRepository: Repository | undefined;
};

export function parseUses({
  str,
  workingRepository,
}: ParseUsesParams): ActionUses {
  const uses: ActionUses = {
    repository: undefined,
    path: undefined,
    ref: undefined,
  };

  const [action, ...ref] = str.split("@");
  if (!action) {
    throw new Error(`Invalid uses format: ${JSON.stringify(str)}`);
  }
  if (ref.length > 0) {
    uses.ref = ref.join("@");
  }

  if (action.startsWith(".")) {
    uses.repository = workingRepository;
    if (action.startsWith("./")) {
      uses.path = action.slice(2);
    } else {
      uses.path = action.slice(1);
    }
  } else {
    const [owner, name, ...paths] = action.split("/");
    if (!owner || !name) {
      throw new Error(`Invalid uses format: ${JSON.stringify(str)}`);
    }
    uses.repository = { owner, name };
    if (paths.length > 0) {
      uses.path = paths.join("/");
    }
  }

  return uses;
}
