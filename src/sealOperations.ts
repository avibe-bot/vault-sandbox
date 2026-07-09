import {
  deriveSigningAddresses,
  generateSigningKey,
  packProtectedRecord,
  sealProtected,
  type ProtectedRecordEnvelope,
  type SigningAddresses,
} from "./vaultCrypto"

export type SealOperationResult = {
  envelope: ProtectedRecordEnvelope
  publicKey?: string
  addresses?: SigningAddresses
}

export async function sealParentProvidedStatic(input: {
  name: string
  value: string
  vmk: Uint8Array
  wrapMeta: string
}): Promise<SealOperationResult> {
  let secretBytes: Uint8Array | undefined = new TextEncoder().encode(input.value)
  try {
    const recordContext = { name: input.name, kind: "static" as const }
    const sealed = await sealProtected(secretBytes, input.vmk, recordContext)
    return { envelope: packProtectedRecord(sealed, input.wrapMeta, recordContext) }
  } finally {
    secretBytes?.fill(0)
    secretBytes = undefined
  }
}

export async function sealGeneratedKeypair(input: {
  name: string
  vmk: Uint8Array
  wrapMeta: string
}): Promise<SealOperationResult> {
  const key = generateSigningKey()
  let privateKey: Uint8Array | undefined = key.privateKey
  try {
    const recordContext = { name: input.name, kind: "keypair" as const, publicKey: key.publicKey }
    const sealed = await sealProtected(privateKey, input.vmk, recordContext)
    return {
      envelope: packProtectedRecord(sealed, input.wrapMeta, recordContext),
      publicKey: key.publicKey,
      addresses: deriveSigningAddresses(key.publicKey),
    }
  } finally {
    privateKey?.fill(0)
    privateKey = undefined
  }
}
