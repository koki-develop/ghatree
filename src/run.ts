import ora from "ora";
import type { Context } from "./context";
import {
  fetchActionDefinition,
  fetchWorkflowDefinition,
  parseUses,
  type Step,
  type WorkflowDefinition,
} from "./gha";
import { fetchWorkflows, type Repository } from "./github";

export type Node = RepositoryNode | WorkflowNode | JobNode | ActionNode;

export type RepositoryNode = {
  type: "repository";
  repository: Repository | undefined;
  dependencies: Node[];
};

export type WorkflowNode = {
  type: "workflow";
  repository: Repository | undefined;
  path: string;
  ref: string | undefined;
  dependencies: Node[];
};

export type JobNode = {
  type: "job";
  path: string;
  dependencies: Node[];
};

export type ActionNode = {
  type: "action";
  repository: Repository | undefined;
  path: string | undefined;
  ref: string | undefined;
  dependencies: Node[];
};

export async function run(context: Context): Promise<RepositoryNode> {
  const root: RepositoryNode = {
    type: "repository",
    repository: context.repository,
    dependencies: [],
  };

  const workflows = await fetchWorkflows(context, {
    repository: context.repository,
  });
  for (const workflow of workflows) {
    const spinner = ora(workflow.path).start();
    await _processWorkflow(context, {
      repository: context.repository,
      workflow,
      ref: undefined,
    })
      .then((node) => {
        root.dependencies.push(node);
        spinner.succeed();
      })
      .catch((error) => {
        spinner.fail();
        throw error;
      });
  }
  process.stderr.write("\n");

  return root;
}

type ProcessWorkflowParams = {
  repository: Repository | undefined;
  workflow: WorkflowDefinition;
  ref: string | undefined;
};

async function _processWorkflow(
  context: Context,
  { repository, workflow, ref }: ProcessWorkflowParams,
): Promise<WorkflowNode> {
  const node: WorkflowNode = {
    type: "workflow",
    repository,
    path: workflow.path,
    ref,
    dependencies: [],
  };

  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    const jobNode: JobNode = {
      type: "job",
      path: jobName,
      dependencies: [],
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
        workflow: await fetchWorkflowDefinition(context, {
          repository: uses.repository,
          workflowPath: uses.path,
          ref: uses.ref,
        }),
        ref: uses.ref,
      });
      jobNode.dependencies.push(reusableWorkflowNode);
    }

    if (job.steps) {
      const stepNodes = await _processSteps(context, {
        repository,
        steps: job.steps,
      });
      jobNode.dependencies.push(...stepNodes);
    }

    node.dependencies.push(jobNode);
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
    dependencies: [],
  };

  if (actionPath?.startsWith("docker://")) {
    return node;
  }

  const action = await fetchActionDefinition(context, {
    repository,
    actionPath,
    ref,
  });

  if (action.runs.using !== "composite") {
    return node;
  }

  const stepNodes = await _processSteps(context, {
    repository,
    steps: action.runs.steps,
  });
  node.dependencies.push(...stepNodes);

  return node;
}

type ProcessStepsParams = {
  repository: Repository | undefined;
  steps: Step[];
};

type CheckoutState = {
  originalRepository: Repository | undefined;
  rootRepository: Repository | undefined;
  checkouts: Map<string, Repository | undefined>;
};

function normalizePath(path: string): string {
  if (!path) return "";
  return path.replace(/^\.\//, "").replace(/\/$/, "");
}

function _updateCheckoutState(state: CheckoutState, step: Step): void {
  if (!step.uses) {
    return;
  }
  if (
    step.uses !== "actions/checkout" &&
    !step.uses.startsWith("actions/checkout@")
  ) {
    return;
  }

  if (step.with?.repository && step.with?.path) {
    const [owner, name] = step.with.repository.split("/");
    if (!owner || !name) {
      return;
    }
    const repo: Repository = { owner, name };

    if (step.with.path === "." || step.with.path === "./") {
      state.rootRepository = repo;
    } else {
      state.checkouts.set(normalizePath(step.with.path), repo);
    }
    return;
  }

  if (step.with?.repository) {
    const [owner, name] = step.with.repository.split("/");
    if (!owner || !name) {
      return;
    }
    const repo: Repository = { owner, name };
    state.rootRepository = repo;
    state.checkouts.clear();
    return;
  }

  if (step.with?.path) {
    if (step.with.path === "." || step.with.path === "./") {
      state.rootRepository = state.originalRepository;
    } else {
      state.checkouts.set(
        normalizePath(step.with.path),
        state.originalRepository,
      );
    }
    return;
  }

  state.rootRepository = state.originalRepository;
  state.checkouts.clear();
}

async function _processSteps(
  context: Context,
  { repository, steps }: ProcessStepsParams,
): Promise<Node[]> {
  const nodes: Node[] = [];
  const checkoutState: CheckoutState = {
    originalRepository: repository,
    rootRepository: repository,
    checkouts: new Map(),
  };

  for (const step of steps) {
    if (step.uses) {
      _updateCheckoutState(checkoutState, step);

      const { workingRepository, usesStr } = (() => {
        if (step.uses === "." || !step.uses.startsWith("./")) {
          return {
            workingRepository: checkoutState.rootRepository,
            usesStr: step.uses,
          };
        }

        const actionPath = normalizePath(step.uses);
        for (const [checkoutPath, repo] of checkoutState.checkouts.entries()) {
          if (actionPath.startsWith(`${checkoutPath}/`)) {
            const relativePath = actionPath.slice(checkoutPath.length + 1);
            return {
              workingRepository: repo,
              usesStr: `./${relativePath}`,
            };
          }
        }

        return {
          workingRepository: checkoutState.rootRepository,
          usesStr: step.uses,
        };
      })();

      const uses = parseUses({
        workingRepository,
        str: usesStr,
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
