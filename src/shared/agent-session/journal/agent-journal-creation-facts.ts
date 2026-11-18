import type { AgentMessageSender } from '../agent-session-message-source'
import type { AgentChatPermissionMode } from '../../agent-launch/permissions/agent-chat-permission-mode'

/** Display-only creation fact; survives removal of the orchestration Task and Dispatch. */
export type AgentJournalAgentStartItem = {
  kind: 'agent-start'
  dispatchId: string
  worker: AgentMessageSender
  task: string
  /** The permission the started agent runs with; absent when unknown or the agent's own. */
  permissionMode?: AgentChatPermissionMode
  /** A message to a finished worker continued it: the Dispatch it followed, and whether its conversation reopened. */
  followUp?: { of: string; reopened: boolean }
}

/** Display-only creation fact for an agent this chat's agent launched on its own (`orca agent launch`),
 *  not a supervised worker: `launchId` is the launch operation, `agent` the launched conversation. */
export type AgentJournalAgentHandoffItem = {
  kind: 'agent-handoff'
  launchId: string
  agent: AgentMessageSender
  task: string
  permissionMode?: AgentChatPermissionMode
}
