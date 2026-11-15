import type { AgentCommandDraftRequest } from '../contracts/commandContracts';
import type { AgentCommandClientResult } from './executeAgentCommand';
import { getOperatorRuntime } from './operatorRuntime';

/**
 * For an action the person started in the interface (a click, a key, a switch
 * or screen-reader activation of a control that names the approval). The
 * approval it records is the human operator's, so only interface code that a
 * person drives may call it; agents and the on-device model use
 * executeAgentCommand, which never approves.
 */
export async function executeOperatorCommand(
  request: AgentCommandDraftRequest,
  options: { approvalReason?: string } = {}
): Promise<AgentCommandClientResult> {
  const runtime = getOperatorRuntime();
  const command = runtime.draft(request);
  const preview = await runtime.preview(command);
  if (preview.status === 'denied') {
    return { preview, approval: null, receipt: await runtime.commit(preview) };
  }
  const approval =
    preview.status === 'requires-approval'
      ? runtime.approve(
          preview.previewId,
          options.approvalReason?.trim() ||
            'Explicit human interface action approved the exact current preview.'
        )
      : null;
  return {
    preview,
    approval,
    receipt: await runtime.commit(preview, approval ?? undefined),
  };
}
