import { Octokit } from "octokit";
import type { Context } from "./context";
import {
  fetchActionDefinition,
  fetchWorkflowDefinition,
  parseUses,
  type Step,
} from "./gha";
import { fetchWorkflows, type Repository } from "./github";

export type Input = {
  repository: Repository | undefined;
};

export type Node = WorkflowNode | JobNode | ActionNode;

export type WorkflowNode = {
  type: "workflow";
  repository: Repository | undefined;
  path: string;
  ref: string | undefined;
  children: Node[];
};

export type JobNode = {
  type: "job";
  name: string;
  children: Node[];
};

export type ActionNode = {
  type: "action";
  repository: Repository | undefined;
  path: string | undefined;
  ref: string | undefined;
  children: Node[];
};

export async function run(input: Input): Promise<Node[]> {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  const context: Context = {
    octokit,
  };

  const nodes: Node[] = [];

  const workflowPaths = await fetchWorkflows(context, {
    repository: input.repository,
  });
  for (const workflowPath of workflowPaths) {
    const node = await _processWorkflow(context, {
      repository: input.repository,
      workflowPath,
      ref: undefined,
    });
    nodes.push(node);
  }

  return nodes;
}

type ProcessWorkflowParams = {
  repository: Repository | undefined;
  workflowPath: string;
  ref: string | undefined;
};

async function _processWorkflow(
  context: Context,
  { repository, workflowPath, ref }: ProcessWorkflowParams,
): Promise<WorkflowNode> {
  const node: WorkflowNode = {
    type: "workflow",
    repository,
    path: workflowPath,
    ref,
    children: [],
  };

  const workflow = await fetchWorkflowDefinition(context, {
    repository,
    workflowPath,
    ref,
  });

  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    const jobNode: JobNode = {
      type: "job",
      name: jobName,
      children: [],
    };

    if (job.uses) {
      const uses = parseUses({
        workingRepository: repository,
        str: job.uses,
      });
      if (!uses.path) {
        throw new Error(
          `Job ${jobName} uses an action without a path: ${job.uses}`,
        );
      }

      const reusableWorkflowNode = await _processWorkflow(context, {
        repository: uses.repository,
        workflowPath: uses.path,
        ref: uses.ref,
      });
      jobNode.children.push(reusableWorkflowNode);
    }

    if (job.steps) {
      const stepNodes = await _processSteps(context, {
        repository,
        steps: job.steps,
      });
      jobNode.children.push(...stepNodes);
    }

    node.children.push(jobNode);
  }

  return node;
}

type ProcessActionParams = {
  repository: Repository | undefined;
  actionPath: string | undefined;
  ref: string | undefined;
};

async function _processAction(
  context: Context,
  { repository, actionPath, ref }: ProcessActionParams,
): Promise<Node> {
  const node: ActionNode = {
    type: "action",
    repository,
    path: actionPath,
    ref,
    children: [],
  };

  const action = await fetchActionDefinition(context, {
    repository,
    actionPath: actionPath || ".",
    ref,
  });

  if (action.runs.using !== "composite") {
    return node;
  }

  const stepNodes = await _processSteps(context, {
    repository,
    steps: action.runs.steps,
  });
  node.children.push(...stepNodes);

  return node;
}

type ProcessStepsParams = {
  repository: Repository | undefined;
  steps: Step[];
};

async function _processSteps(
  context: Context,
  { repository, steps }: ProcessStepsParams,
): Promise<Node[]> {
  const nodes: Node[] = [];

  for (const step of steps) {
    if (step.uses) {
      const uses = parseUses({
        workingRepository: repository, // TODO: get working repository from checkout
        str: step.uses,
      });
      const actionNode = await _processAction(context, {
        repository: uses.repository,
        actionPath: uses.path,
        ref: uses.ref,
      });
      nodes.push(actionNode);
    }
  }

  return nodes;
}
