import {
  deriveSigningAddresses,
  deriveSolanaAddress,
  parseSigningCurve,
  generateSigningKey,
  packProtectedRecord,
  sealProtected,
  type ProtectedRecordEnvelope,
  type SigningAddresses,
  type SigningCurve,
} from "./vaultCrypto"
import { generateStaticSecretBytes, type StaticSecretGenerationRecipe } from "./staticSecretGeneration"

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

export async function sealGeneratedStatic(input: {
  name: string
  generate: StaticSecretGenerationRecipe
  vmk: Uint8Array
  wrapMeta: string
}): Promise<SealOperationResult> {
  const secretBytes = generateStaticSecretBytes(input.generate)
  try {
    const recordContext = { name: input.name, kind: "static" as const }
    const sealed = await sealProtected(secretBytes, input.vmk, recordContext)
    return { envelope: packProtectedRecord(sealed, input.wrapMeta, recordContext) }
  } finally {
    secretBytes.fill(0)
  }
}

export async function sealGeneratedKeypair(input: {
  name: string
  curve?: SigningCurve
  vmk: Uint8Array
  wrapMeta: string
}): Promise<SealOperationResult> {
  const curve = parseSigningCurve(input.curve)
  const key = generateSigningKey(curve)
  let privateKey: Uint8Array | undefined = key.privateKey
  try {
    const recordContext = {
      name: input.name, kind: "keypair" as const, publicKey: key.publicKey,
      ...(curve === "ed25519" ? { curve } : {}),
    }
    const sealed = await sealProtected(privateKey, input.vmk, recordContext)
    return {
      envelope: packProtectedRecord(sealed, input.wrapMeta, recordContext),
      publicKey: key.publicKey,
      addresses: curve === "ed25519" ? { solana: deriveSolanaAddress(key.publicKey) } : deriveSigningAddresses(key.publicKey),
    }
  } finally {
    privateKey?.fill(0)
    privateKey = undefined
  }
}
