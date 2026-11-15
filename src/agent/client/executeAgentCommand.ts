import type {
  AgentApprovalToken,
  AgentCommandDraftRequest,
  AgentCommandPreview,
  AgentExecutionReceipt,
} from '../contracts/commandContracts';
import { getInstalledAgentRuntime } from './operatorRuntime';

export interface AgentCommandClientResult {
  preview: AgentCommandPreview;
  approval: AgentApprovalToken | null;
  receipt: AgentExecutionReceipt | null;
}

/**
 * Shared adapter for agent and programmatic callers (the on-device operator).
 * It never approves: a preview that requires approval comes back unexecuted,
 * for the person at the controls to approve in the interface. An action the
 * person started there goes through executeOperatorCommand instead. The
 * runtime is read from module scope, never from the window property, which a
 * page script can replace.
 */
export async function executeAgentCommand(
  request: AgentCommandDraftRequest
): Promise<AgentCommandClientResult> {
  const api = getInstalledAgentRuntime();
  const command = api.draft(request);
  const preview = await api.preview(command);
  if (preview.status === 'denied') {
    return { preview, approval: null, receipt: await api.commit(preview) };
  }
  if (preview.status === 'requires-approval') {
    return { preview, approval: null, receipt: null };
  }
  return { preview, approval: null, receipt: await api.commit(preview) };
}
