import { RpcError } from "./rpc"
import {
  openRootMetadata,
  protectedRecordContextFromMetadata,
  releaseProtectedDek,
  unpackProtectedRecord,
  type BlindBox,
  type ProtectedRecordEnvelope,
} from "./vaultCrypto"
import {
  agentDeliverBlindBoxContextFromSignedContext,
  agentPublicKeyFromSignedContext,
  assertSignedOperationContextsConsumable,
  consumeSignedOperationContexts,
  displayFingerprint,
  formatSignedDisplayBlock,
  parseSignedOperationContext,
  signedContextBatchChallenge,
  stableJson,
  verifySignedOperationContext,
  type SignedOperationContext,
} from "./operationContext"

export type ApproveReleaseItem = {
  material: { name: string; envelope: ProtectedRecordEnvelope }
  context: SignedOperationContext
}

export type ApproveReleaseApproval = {
  body: string
  challenge: Uint8Array
}

export type ApproveReleaseBatchResult = {
  blindBoxes: BlindBox[]
}

export function parseApproveReleaseItem(value: unknown, materialParser: (value: unknown) => { name: string; envelope: ProtectedRecordEnvelope }): ApproveReleaseItem {
  if (typeof value !== "object" || value === null) throw new RpcError("invalid_payload", "approveRelease item must be an object")
  const record = value as Record<string, unknown>
  return {
    material: materialParser(record.material),
    context: parseSignedOperationContext(record.context),
  }
}

function assertDisplayMatchesBatch(items: ApproveReleaseItem[]): void {
  const firstDisplay = items[0]?.context.display
  if (!firstDisplay) throw new RpcError("invalid_payload", "approveRelease requires at least one item")
  if (items[0].context.purpose !== "agent-deliver") throw new RpcError("invalid_context", "approveRelease only accepts agent-deliver contexts")
  const expectedFingerprint = displayFingerprint(items[0].context)
  const expectedRecipient = recipientFingerprint(items[0].context)
  for (const item of items) {
    if (item.context.purpose !== "agent-deliver") throw new RpcError("invalid_context", "approveRelease only accepts agent-deliver contexts")
    if (displayFingerprint(item.context) !== expectedFingerprint) {
      throw new RpcError("invalid_context", "approveRelease batch contexts must share one signed display block")
    }
    if (recipientFingerprint(item.context) !== expectedRecipient) {
      throw new RpcError("invalid_context", "approveRelease batch contexts must share one signed recipient")
    }
  }

  const displayed = new Set(firstDisplay.secrets.map((secret) => `${secret.name}:${secret.kind}`))
  for (const item of items) {
    const { recordMetadata } = unpackProtectedRecord(item.material.envelope)
    const kind = recordMetadata?.kind ?? "static"
    if (!displayed.has(`${item.material.name}:${kind}`)) {
      throw new RpcError("invalid_context", "signed display block does not cover every release item")
    }
  }
}

function recipientFingerprint(context: SignedOperationContext): string {
  if (!context.grantId) throw new RpcError("invalid_context", "agent delivery context is missing grantId")
  if (!context.agent) throw new RpcError("invalid_context", "agent delivery context is missing agent key")
  return stableJson({ agent: context.agent, grantId: context.grantId })
}

export async function approveReleaseBatch(input: {
  items: ApproveReleaseItem[]
  vmk: Uint8Array
  wrapMeta: string
  now?: number
  consumeReplayIds?: boolean
  onApprovalAccepted?: (now: number) => void
  confirm: (approval: ApproveReleaseApproval) => Promise<void>
}): Promise<ApproveReleaseBatchResult> {
  if (input.items.length === 0) throw new RpcError("invalid_payload", "approveRelease requires at least one item")
  assertDisplayMatchesBatch(input.items)
  const rootMetadata = await openRootMetadata(input.wrapMeta, input.vmk)
  const contexts = input.items.map((item) => item.context)
  for (const item of input.items) {
    verifySignedOperationContext({
      context: item.context,
      rootMetadata,
      expectedPurpose: "agent-deliver",
      now: input.now,
    })
  }
  assertSignedOperationContextsConsumable(contexts, input.now)

  const challenge = await signedContextBatchChallenge(contexts)
  const firstContext = input.items[0].context
  await input.confirm({
    body: formatSignedDisplayBlock(firstContext.display, {
      agentFingerprint: firstContext.agent?.fingerprint,
      grantId: firstContext.grantId,
    }),
    challenge,
  })
  const approvalNow = input.now ?? Date.now()
  for (const item of input.items) {
    verifySignedOperationContext({
      context: item.context,
      rootMetadata,
      expectedPurpose: "agent-deliver",
      now: approvalNow,
    })
  }
  input.onApprovalAccepted?.(approvalNow)
  assertSignedOperationContextsConsumable(contexts, approvalNow)

  const blindBoxes: BlindBox[] = []
  for (const item of input.items) {
    const { sealed, recordMetadata } = unpackProtectedRecord(item.material.envelope)
    if (recordMetadata?.kind !== "static") throw new RpcError("invalid_payload", "approveRelease requires static protected records")
    blindBoxes.push(
      await releaseProtectedDek(
        sealed,
        input.vmk,
        agentPublicKeyFromSignedContext(item.context),
        protectedRecordContextFromMetadata(item.material.name, recordMetadata),
        await agentDeliverBlindBoxContextFromSignedContext(item.context, item.material.name),
      ),
    )
  }
  if (input.consumeReplayIds !== false) await consumeSignedOperationContexts(contexts, approvalNow)

  return { blindBoxes }
}
