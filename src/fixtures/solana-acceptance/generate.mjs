// Offline fixture producer. Never imports sandbox production code.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AddressLookupTableAccount, ComputeBudgetProgram, Keypair, Message, MessageV0, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { createTransferInstruction, createTransferCheckedInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { Interface, Transaction as EvmTransaction, SigningKey, keccak256 } from 'ethers'

const hex = b => Buffer.from(b).toString('hex')
const b64 = b => Buffer.from(b).toString('base64')
const sha256 = b => createHash('sha256').update(b).digest('hex')
const bytes = value => Buffer.from(value, 'hex')
const namedKey = label => new PublicKey(createHash('sha256').update(`avibe-public-acceptance:${label}`).digest())
const fixturesDir = fileURLToPath(new URL('.', import.meta.url))
const corpusPath = `${fixturesDir}corpus.json`
const rfc = [
  { id: 'rfc8032-test-1', seedHex: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', publicKeyHex: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a' },
  { id: 'rfc8032-test-2', seedHex: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', publicKeyHex: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c' },
].map(key => {
  const privateKey = createPrivateKey({ key: Buffer.concat([bytes('302e020100300506032b657004220420'), bytes(key.seedHex)]), format: 'der', type: 'pkcs8' })
  const nativePublic = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32)
  const sdkKey = Keypair.fromSeed(bytes(key.seedHex))
  if (hex(nativePublic) !== key.publicKeyHex || hex(sdkKey.publicKey.toBytes()) !== key.publicKeyHex) throw new Error('RFC8032 key mismatch')
  return { ...key, publicKeyBase58: sdkKey.publicKey.toBase58(), privateKey, sdkKey }
})
const [alice, bob] = rfc
const payer = alice.sdkKey.publicKey
const destination = namedKey('destination-wallet')
const sourceToken = namedKey('source-token-account')
const destinationToken = namedKey('destination-token-account')
const mint = namedKey('mint')
const blockhash = namedKey('invented-blockhash-not-from-chain').toBase58()
const genericProgram = namedKey('generic-program')
const memoProgram = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const jupiterProgram = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')

// Locate valid SDK serialization fields solely to define reproducible mutations.
// This is not an acceptance parser and never determines a rejection expectation.
function offsets(message, version) {
  let at = version === 'v0' ? 1 : 0
  const result = { header: at }
  at += 3
  const compact = () => {
    const offset = at
    let n = 0, shift = 0, byte
    do { byte = message[at++]; n |= (byte & 127) << shift; shift += 7 } while (byte & 128)
    return { offset, length: at - offset, value: n }
  }
  result.accountCount = compact()
  result.accountKeys = at
  at += result.accountCount.value * 32
  result.recentBlockhash = at
  at += 32
  result.instructionCount = compact()
  result.instructions = []
  for (let i = 0; i < result.instructionCount.value; i++) {
    const programIndex = at++
    const accountCount = compact()
    const accountIndices = at
    at += accountCount.value
    const dataLength = compact()
    const data = at
    at += dataLength.value
    result.instructions.push({ programIndex, accountCount, accountIndices, dataLength, data })
  }
  result.lookups = []
  if (version === 'v0') {
    result.lookupCount = compact()
    for (let i = 0; i < result.lookupCount.value; i++) {
      const tableKey = at
      at += 32
      const writableCount = compact(), writableIndices = at
      at += writableCount.value
      const readonlyCount = compact(), readonlyIndices = at
      at += readonlyCount.value
      result.lookups.push({ tableKey, writableCount, writableIndices, readonlyCount, readonlyIndices })
    }
  }
  if (at !== message.length) throw new Error('SDK serialization layout changed')
  return result
}

const solana = []
function solanaVector(id, version, instructions, decoded, { requested = alice, tables = [], extraLookups = [], repeatDestinationKey = false, description = '' } = {}) {
  let message, tx, compiled, accountKeys, lookups
  if (version === 'legacy') {
    tx = new Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(...instructions)
    compiled = tx.compileMessage()
    if (repeatDestinationKey) compiled = new Message({ ...compiled, accountKeys: [compiled.accountKeys[0], compiled.accountKeys[0], ...compiled.accountKeys.slice(2)] })
    message = compiled.serialize()
    tx = new VersionedTransaction(compiled)
    accountKeys = compiled.accountKeys
    lookups = []
  } else {
    compiled = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions }).compileToV0Message(tables)
    if (extraLookups.length) compiled = new MessageV0({ ...compiled, addressTableLookups: [...compiled.addressTableLookups, ...extraLookups] })
    tx = new VersionedTransaction(compiled)
    message = compiled.serialize()
    accountKeys = compiled.staticAccountKeys
    lookups = compiled.addressTableLookups
  }
  const unsigned = tx.serialize()
  const signatures = accountKeys.slice(0, compiled.header.numRequiredSignatures).map(publicKey => {
    const key = rfc.find(k => k.publicKeyBase58 === publicKey.toBase58())
    if (!key) throw new Error('No public seed for required signer')
    const signature = sign(null, message, key.privateKey)
    if (!verify(null, message, createPublicKey(key.privateKey), signature)) throw new Error('Native Ed25519 self-check failed')
    tx.addSignature(publicKey, signature)
    return { keyId: key.id, publicKeyBase58: key.publicKeyBase58, publicKeyHex: key.publicKeyHex, signatureHex: hex(signature), signatureBase64: b64(signature) }
  })
  const signed = tx.serialize()
  const compiledInstructions = compiled.compiledInstructions
  const expectedInstructions = compiledInstructions.map((ix, i) => ({
    programIdIndex: ix.programIdIndex,
    programId: instructions[i].programId.toBase58(),
    accountIndices: [...ix.accountKeyIndexes],
    accountAddressesFromConstruction: [...ix.accountKeyIndexes].map((accountIndex, j) => accountIndex < accountKeys.length ? accountKeys[accountIndex].toBase58() : instructions[i].keys[j].pubkey.toBase58()),
    dataHex: hex(instructions[i].data),
    decoded: decoded[i],
  }))
  solana.push({
    id, version, description,
    provenance: 'Offline official-SDK serialization of synthetic inputs; not fetched from a chain, simulation, quote, or RPC. Unknown program payloads are only shape examples, not asserted valid program invocations.',
    requestedSigner: { keyId: requested.id, publicKeyHex: requested.publicKeyHex, publicKeyBase58: requested.publicKeyBase58 },
    message: { hex: hex(message), base64: b64(message), byteLength: message.length, sha256: sha256(message) },
    transaction: { unsignedHex: hex(unsigned), unsignedBase64: b64(unsigned), signedHex: hex(signed), signedBase64: b64(signed), messageOffset: 1 + 64 * signatures.length },
    expected: {
      feePayer: payer.toBase58(), recentBlockhash: blockhash, header: compiled.header,
      requiredSigners: accountKeys.slice(0, compiled.header.numRequiredSignatures).map(k => k.toBase58()),
      staticAccountKeys: accountKeys.map(k => k.toBase58()),
      addressTableLookups: lookups.map(l => ({ accountKey: l.accountKey.toBase58(), writableIndexes: [...l.writableIndexes], readonlyIndexes: [...l.readonlyIndexes] })),
      // The constructed table's addresses above are not supplied to the verifier.
      // Indexes and table bytes remain raw: no ALT resolution is expected.
      instructions: expectedInstructions,
      partiallyDecoded: lookups.length > 0 || decoded.some(d => d.kind === 'raw'),
    },
    signatures, offsets: offsets(message, version),
  })
}
const solTransfer = (from, to, lamports) => SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports })
solanaVector('legacy-sol-transfer', 'legacy', [solTransfer(payer, destination, 1234567890n)], [
  { kind: 'system-transfer', source: payer.toBase58(), destination: destination.toBase58(), lamports: '1234567890' },
], { description: 'Native SOL; exact integer lamports, no fee policy.' })
solanaVector('legacy-spl-transfer-large-amount', 'legacy', [createTransferInstruction(sourceToken, destinationToken, payer, 9007199254740993n)], [
  { kind: 'spl-transfer', sourceTokenAccount: sourceToken.toBase58(), destinationTokenAccount: destinationToken.toBase58(), authority: payer.toBase58(), amount: '9007199254740993', mint: null, decimals: null },
], { description: 'Token Transfer encodes no mint/decimals. Amount is above JS safe integer. Token accounts are synthetic, not asserted ATAs.' })
solanaVector('legacy-spl-transfer-u64-max', 'legacy', [createTransferInstruction(sourceToken, destinationToken, payer, 18446744073709551615n)], [
  { kind: 'spl-transfer', sourceTokenAccount: sourceToken.toBase58(), destinationTokenAccount: destinationToken.toBase58(), authority: payer.toBase58(), amount: '18446744073709551615', mint: null, decimals: null },
], { description: 'Full u64 raw amount, no token metadata, balance or fee policy.' })
solanaVector('legacy-spl-transfer-checked-different-fee-payer', 'legacy', [createTransferCheckedInstruction(sourceToken, mint, destinationToken, bob.sdkKey.publicKey, 1234567n, 6)], [
  { kind: 'spl-transfer-checked', sourceTokenAccount: sourceToken.toBase58(), destinationTokenAccount: destinationToken.toBase58(), authority: bob.publicKeyBase58, mint: mint.toBase58(), amount: '1234567', decimals: 6 },
], { requested: bob, description: 'Two signers; requested token authority is not fee payer. Does not assert mint names, symbols, balances, or onchain mint decimals.' })
solanaVector('v0-sol-transfer-static', 'v0', [solTransfer(payer, destination, 1n)], [
  { kind: 'system-transfer', source: payer.toBase58(), destination: destination.toBase58(), lamports: '1' },
], { description: 'Canonical v0, zero address-table lookups.' })
const table = new AddressLookupTableAccount({ key: namedKey('lookup-table'), state: { deactivationSlot: 18446744073709551615n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: payer, addresses: [sourceToken, destinationToken, mint] } })
const shapedRouteData = Buffer.concat([bytes(sha256(Buffer.from('global:route')).slice(0, 16)), bytes('010000001164000000000000e80300000000000032000000')])
solanaVector('v0-unresolved-alt-synthetic-jupiter-shaped', 'v0', [new TransactionInstruction({ programId: jupiterProgram, keys: [
  { pubkey: payer, isSigner: true, isWritable: true },
  { pubkey: sourceToken, isSigner: false, isWritable: true },
  { pubkey: destinationToken, isSigner: false, isWritable: true },
  { pubkey: mint, isSigner: false, isWritable: false },
], data: shapedRouteData })], [{ kind: 'raw', reason: 'Unknown program; synthetic Anchor route discriminator and invented trailing bytes. Not a real Jupiter route or swap decode.' }], { tables: [table], description: 'Official Jupiter program ID only; payload invented. ALT table construction is generator-only; consumer receives unresolved table/index bytes.' })
solanaVector('v0-unresolved-alt-system-transfer', 'v0', [solTransfer(payer, destinationToken, 7n)], [
  { kind: 'raw', reason: 'System transfer destination is an unresolved ALT account reference. Do not invent an address or resolve the table.' },
], { tables: [table], description: 'Known program does not authorize resolving ALT addresses; preserve source table/index bytes only.' })
solanaVector('legacy-token2022-compute-memo-raw', 'legacy', [
  createTransferInstruction(sourceToken, destinationToken, payer, 5n, [], TOKEN_2022_PROGRAM_ID),
  ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
  new TransactionInstruction({ programId: memoProgram, keys: [], data: Buffer.from('PUBLIC FIXTURE ONLY — not a payment memo', 'utf8') }),
], [
  { kind: 'raw', reason: 'Token-2022 is intentionally not decoded.' },
  { kind: 'raw', reason: 'Compute Budget is intentionally not decoded.' },
  { kind: 'raw', reason: 'Memo is intentionally not decoded.' },
], { description: 'One blind-signing summary notice for all three undecoded instructions; original message remains complete.' })
solanaVector('legacy-multiple-signers-generic', 'legacy', [new TransactionInstruction({ programId: genericProgram, keys: [
  { pubkey: bob.sdkKey.publicKey, isSigner: true, isWritable: false },
  { pubkey: destination, isSigner: false, isWritable: true },
], data: bytes('001122334455') })], [{ kind: 'raw', reason: 'Synthetic unknown program.' }], { requested: bob, description: 'Fee payer Alice and readonly signer Bob; no single-signer policy.' })

solanaVector('legacy-canonical-multibyte-data-length-raw', 'legacy', [new TransactionInstruction({ programId: genericProgram, keys: [], data: Buffer.alloc(128, 0xab) })], [{ kind: 'raw', reason: '128 bytes of synthetic opaque data; compact-u16 data length requires two canonical bytes.' }], { description: 'Positive canonical multi-byte compact-u16, not merely rejecting overlong encodings.' })

solanaVector('v0-unused-unresolved-alt-static-transfer', 'v0', [solTransfer(payer, destination, 8n)], [
  { kind: 'system-transfer', source: payer.toBase58(), destination: destination.toBase58(), lamports: '8' },
], { extraLookups: [{ accountKey: table.key, writableIndexes: [], readonlyIndexes: [2] }], description: 'SDK MessageV0 constructed with an unused but nonempty lookup: static transfer decodes; ALT still triggers one undecoded-content notice.' })
solanaVector('legacy-sol-transfer-to-nonsigner-known-key', 'legacy', [solTransfer(payer, bob.sdkKey.publicKey, 9n)], [
  { kind: 'system-transfer', source: payer.toBase58(), destination: bob.publicKeyBase58, lamports: '9' },
], { description: 'Bob is present only as a nonsigner recipient; requesting his signature must be rejected.' })
solanaVector('legacy-two-sol-transfers', 'legacy', [solTransfer(payer, destination, 1n), solTransfer(payer, bob.sdkKey.publicKey, 2n)], [
  { kind: 'system-transfer', source: payer.toBase58(), destination: destination.toBase58(), lamports: '1' },
  { kind: 'system-transfer', source: payer.toBase58(), destination: bob.publicKeyBase58, lamports: '2' },
], { description: 'Two independently encoded transfers preserve instruction order.' })
const systemNormal = solTransfer(payer, destination, 10n)
const checkedNormal = createTransferCheckedInstruction(sourceToken, mint, destinationToken, payer, 10n, 6)
solanaVector('legacy-known-program-near-misses-raw', 'legacy', [
  new TransactionInstruction({ ...systemNormal, data: Buffer.concat([systemNormal.data, bytes('00')]) }),
  new TransactionInstruction({ ...systemNormal, keys: [...systemNormal.keys, { pubkey: mint, isSigner: false, isWritable: false }] }),
  createTransferInstruction(sourceToken, destinationToken, namedKey('multisig-authority'), 10n, [alice.sdkKey, bob.sdkKey]),
  new TransactionInstruction({ ...checkedNormal, data: checkedNormal.data.subarray(0, 9) }),
], [
  { kind: 'raw', reason: 'System transfer data is 13 bytes, not canonical 12-byte transfer.' },
  { kind: 'raw', reason: 'System transfer has 3 accounts, not supported exact 2-account form.' },
  { kind: 'raw', reason: 'SPL Transfer has multisig authority and two explicit signers, not supported 3-account decode.' },
  { kind: 'raw', reason: 'SPL TransferChecked data is truncated to 9 bytes; whole outer message is canonical.' },
], { description: 'Known program near misses are complete canonical outer messages, approvable raw; they are not parser-level malformed-message rejections.' })
solanaVector('legacy-signed-packet-exactly-1232', 'legacy', [new TransactionInstruction({ programId: genericProgram, keys: [], data: Buffer.alloc(1062, 0xab) })], [{ kind: 'raw', reason: 'Opaque payload at exact 1232-byte signed transaction limit.' }], { description: 'Canonical message1167 + one64-byte signature + one count byte =1232. One more message byte exceeds wire packet limit.' })

solanaVector('legacy-repeated-static-key-wire-valid', 'legacy', [solTransfer(payer, destination, 11n)], [
  { kind: 'system-transfer', source: payer.toBase58(), destination: payer.toBase58(), lamports: '11' },
], { repeatDestinationKey: true, description: 'Official Message constructor serializes repeated static keys. Wire sanitize accepts; bank AccountLoadedTwice is outside wire-parser policy. Do not reject solely for duplicate keys.' })

const negative = []
function mutation(id, baseId, target, offset, deleteCount, insertHex, reason) {
  const base = solana.find(v => v.id === baseId)
  const original = bytes(target === 'message' ? base.message.hex : base.transaction.unsignedHex)
  const mutated = Buffer.concat([original.subarray(0, offset), bytes(insertHex), original.subarray(offset + deleteCount)])
  negative.push({ id, baseId, target, mutation: { offset, deleteCount, insertHex }, bytesHex: hex(mutated), bytesBase64: b64(mutated), expected: { action: 'reject', reason } })
}
const legacy = solana[0], lo = legacy.offsets
const v0 = solana.find(v => v.id === 'v0-unresolved-alt-synthetic-jupiter-shaped'), vo = v0.offsets
const editMessage = (id, offset, n, value, reason) => mutation(id, legacy.id, 'message', offset, n, value, reason)
editMessage('legacy-nonminimal-account-count', lo.accountCount.offset, 1, `${(lo.accountCount.value | 128).toString(16)}00`, 'Noncanonical compact-u16 account length.')
editMessage('legacy-nonminimal-instruction-count', lo.instructionCount.offset, 1, '8100', 'Noncanonical compact-u16 instruction length.')
editMessage('legacy-compact-u16-overflow', lo.accountCount.offset, 1, 'ffff04', 'Compact-u16 value exceeds 65535.')
editMessage('legacy-compact-u16-too-long', lo.accountCount.offset, 1, '80808000', 'Compact-u16 encoding exceeds three bytes.')
editMessage('legacy-no-required-signer', lo.header, 1, '00', 'Header has no fee payer signer.')
editMessage('legacy-readonly-signers-overflow', lo.header + 1, 1, '02', 'Readonly signed count exceeds required signatures.')
editMessage('legacy-fee-payer-readonly', lo.header + 1, 1, '01', 'Fee payer must be writable in the canonical message header.')
editMessage('legacy-readonly-unsigned-overflow', lo.header + 2, 1, 'ff', 'Readonly unsigned count exceeds unsigned static keys.')
editMessage('legacy-program-index-oob', lo.instructions[0].programIndex, 1, 'ff', 'Program account index is outside message accounts.')
editMessage('legacy-account-index-oob', lo.instructions[0].accountIndices, 1, 'ff', 'Instruction account index is outside message accounts.')
editMessage('legacy-truncated-blockhash', lo.recentBlockhash + 31, bytes(legacy.message.hex).length - lo.recentBlockhash - 31, '', 'Recent blockhash is truncated.')
editMessage('legacy-truncated-instruction-data', bytes(legacy.message.hex).length - 1, 1, '', 'Instruction data is truncated.')
editMessage('legacy-trailing-byte', bytes(legacy.message.hex).length, 0, '00', 'Trailing bytes are not part of canonical legacy message.')
mutation('v1-unsupported', v0.id, 'message', 0, 1, '81', 'Version 1 is unsupported and must produce a clear unsupported-version error.')
mutation('v0-trailing-byte', v0.id, 'message', bytes(v0.message.hex).length, 0, '00', 'Trailing bytes are not part of canonical v0 message.')
mutation('v0-truncated-lookup', v0.id, 'message', bytes(v0.message.hex).length - 1, 1, '', 'Address-table readonly index list is truncated.')
mutation('v0-nonminimal-lookup-count', v0.id, 'message', vo.lookupCount.offset, 1, '8100', 'Noncanonical compact-u16 lookup count.')
mutation('v0-nonminimal-lookup-writable-count', v0.id, 'message', vo.lookups[0].writableCount.offset, 1, '8200', 'Noncanonical compact-u16 lookup writable index length.')
mutation('outer-signature-count-mismatch', legacy.id, 'transaction', 0, 1, '00', 'Outer signature count does not match message header.')
mutation('outer-nonminimal-signature-count', legacy.id, 'transaction', 0, 1, '8100', 'Outer signature count has a noncanonical compact-u16 encoding.')
mutation('outer-truncated-signature', legacy.id, 'transaction', 64, bytes(legacy.transaction.unsignedHex).length - 64, '', 'Outer signature array is truncated.')
mutation('outer-trailing-byte', legacy.id, 'transaction', bytes(legacy.transaction.unsignedHex).length, 0, '00', 'Outer transaction contains a trailing byte after its canonical message.')

mutation('v0-empty-lookup', v0.id, 'message', vo.lookups[0].writableCount.offset, bytes(v0.message.hex).length - vo.lookups[0].writableCount.offset, '0000', 'Lookup has neither writable nor readonly indexes.')
mutation('v0-program-index-loaded', v0.id, 'message', vo.instructions[0].programIndex, 1, vo.accountCount.value.toString(16).padStart(2, '0'), 'Program id index must name a static account, not an unresolved loaded address.')
mutation('v0-account-index-equals-total', v0.id, 'message', vo.instructions[0].accountIndices, 1, (vo.accountCount.value + 3).toString(16).padStart(2, '0'), 'Account index equals static+loaded count, outside valid range.')
mutation('v0-account-count-257', v0.id, 'message', vo.lookups[0].writableCount.offset, bytes(v0.message.hex).length - vo.lookups[0].writableCount.offset, `ff01${hex(Uint8Array.from({ length: 255 }, (_, i) => i))}00`, 'Two static +255 unresolved loaded accounts exceeds256 account addressability, while below packet limit.')
const packet = solana.find(v => v.id === 'legacy-signed-packet-exactly-1232')
if (bytes(packet.transaction.signedHex).length !== 1232) throw new Error('Packet-boundary positive is not exactly1232 bytes')
mutation('message-packet-exceeds-1232', packet.id, 'message', packet.offsets.instructions[0].dataLength.offset, 2, 'a708ab', 'Canonical data-length1063 and extra data byte produce1233-byte signed transaction; exceeds1232-byte packet maximum.')

const signerChecks = [
  { id: 'expected-key-present-only-as-nonsigner', baseId: 'legacy-sol-transfer-to-nonsigner-known-key', expectedSignerHex: bob.publicKeyHex, expectedSignerBase58: bob.publicKeyBase58, expected: { action: 'reject', reason: 'signer_not_required' } },
  { id: 'expected-key-absent', baseId: legacy.id, expectedSignerHex: bob.publicKeyHex, expectedSignerBase58: bob.publicKeyBase58, expected: { action: 'reject', reason: 'signer_not_required' } },
]

const evm = []
const evmPublicScalarHex = '0'.repeat(63) + '1'
const evmSigningKey = new SigningKey(`0x${evmPublicScalarHex}`)
const receiver = '0x1111111111111111111111111111111111111111'
const token = '0x2222222222222222222222222222222222222222'
const router = '0x3333333333333333333333333333333333333333'
const erc20 = new Interface(['function transfer(address to,uint256 amount)'])
const routerShape = new Interface(['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)'])
function evmVector(id, txInput, decoded, description) {
  const tx = EvmTransaction.from(txInput)
  const serialized = tx.unsignedSerialized
  const signature = evmSigningKey.sign(tx.unsignedHash)
  const unsignedTransaction = { type: tx.type === 2 ? 'eip1559' : 'legacy', chainId: tx.chainId.toString(), nonce: tx.nonce.toString(), to: tx.to, value: tx.value.toString(), gas: tx.gasLimit.toString(), data: tx.data }
  if (tx.type === 2) Object.assign(unsignedTransaction, { maxFeePerGas: tx.maxFeePerGas.toString(), maxPriorityFeePerGas: tx.maxPriorityFeePerGas.toString() })
  else unsignedTransaction.gasPrice = tx.gasPrice.toString()
  evm.push({ id, description, provenance: 'Offline ethers serialization/ABI encoding with synthetic addresses. No onchain history, quote, protocol execution, or funding is claimed.', context: { kind: 'evm-transaction', chainId: tx.chainId.toString(), unsignedTransaction, digestAlgorithm: 'keccak256', digest: tx.unsignedHash.slice(2) }, unsignedSerialized: serialized, expected: { decoded, selector: tx.data === '0x' ? null : tx.data.slice(0, 10), calldata: tx.data, partiallyDecoded: decoded.kind === 'raw', serializedKeccak256: keccak256(serialized).slice(2) }, signature: { publicScalarHex: evmPublicScalarHex, publicKeyHex: evmSigningKey.compressedPublicKey.slice(2), r: signature.r, s: signature.s, yParity: signature.yParity, serializedHex: signature.serialized } })
}
const common = { type: 2, chainId: 11155111n, nonce: 0, gasLimit: 21000n, maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n }
evmVector('evm-eth-eip1559', { ...common, to: receiver, value: 1234567890123456789n, data: '0x' }, { kind: 'native-transfer', to: receiver, value: '1234567890123456789' }, 'Synthetic Sepolia-labelled ETH envelope; chain label does not ensure test-only cryptographic behavior.')
evmVector('evm-erc20-transfer', { ...common, to: token, value: 0n, gasLimit: 65000n, data: erc20.encodeFunctionData('transfer', [receiver, 9007199254740993n]) }, { kind: 'erc20-transfer', to: receiver, amount: '9007199254740993' }, 'ERC20 selector/ABI from ethers; amount above JS safe integer; no token metadata inference.')
evmVector('evm-synthetic-uniswap-shaped-unknown-selector', { ...common, to: router, value: 0n, gasLimit: 250000n, data: routerShape.encodeFunctionData('exactInputSingle', [[token, receiver, 3000, receiver, 2000000000n, 1234567n, 1000000n, 0n]]) }, { kind: 'raw', reason: 'Uniswap-V3-shaped ABI encoding, invented addresses and values; not a quote or executable swap claim.' }, 'Raw complete calldata only, one blind-signing notice; do not decode into swap semantics.')
evmVector('evm-unknown-short-calldata', { ...common, to: router, value: 0n, gasLimit: 50000n, data: '0xdeadbe' }, { kind: 'raw', reason: 'Unknown payload shorter than a full selector.' }, 'Three bytes are complete raw calldata, not a fabricated four-byte selector.')
evmVector('evm-eth-legacy-zero-nonce', { type: 0, chainId: 11155111n, nonce: 0, gasPrice: 2000000000n, gasLimit: 21000n, to: receiver, value: 0n, data: '0x' }, { kind: 'native-transfer', to: receiver, value: '0' }, 'Legacy zero-valued quantity encoding; independent ethers envelope hash.')
const transferData = erc20.encodeFunctionData('transfer', [receiver, 9007199254740993n])
for (const [suffix, extra] of [['trailing-byte', '00'], ['trailing-word', '00'.repeat(32)]]) {
  evmVector(`evm-erc20-${suffix}-raw`, { ...common, to: token, value: 0n, gasLimit: 65000n, data: `${transferData}${extra}` }, { kind: 'raw', reason: 'Known selector but noncanonical ABI trailing data. Preserve it all; do not silently decode a prefix.' }, 'Deliberate mutation of independently ABI-encoded transfer; not a canonical ERC20 call.')
}
evmVector('evm-erc20-dirty-address-word-raw', { ...common, to: token, value: 0n, gasLimit: 65000n, data: `${transferData.slice(0, 10)}ff${transferData.slice(12)}` }, { kind: 'raw', reason: 'Known selector but dirty high byte in address word.' }, 'Deliberately noncanonical address padding; preserve complete calldata as unknown.')
const executeShape = new Interface(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable'])
evmVector('evm-synthetic-uniswap-execute-dynamic-raw', { ...common, to: router, value: 0n, gasLimit: 250000n, data: executeShape.encodeFunctionData('execute', ['0x0008', ['0x112233', '0x44556677'], 2000000000n]) }, { kind: 'raw', reason: 'Synthetic Universal-Router-shaped execute ABI encoding; unknown selector and invented commands/inputs.' }, 'Dynamic nested calldata preserves all bytes; no real Uniswap transaction or history is claimed.')
evmVector('evm-contract-creation-raw', { ...common, to: null, value: 0n, gasLimit: 100000n, data: '0x600060005560016000f3' }, { kind: 'raw', reason: 'Synthetic contract creation initcode, no destination.' }, 'Null destination is contract creation, not an omitted receiver to infer.')
evmVector('evm-eip155-published-example', { type: 0, chainId: 1n, nonce: 9, gasPrice: 20000000000n, gasLimit: 21000n, to: '0x3535353535353535353535353535353535353535', value: 1000000000000000000n, data: '0x' }, { kind: 'native-transfer', to: '0x3535353535353535353535353535353535353535', value: '1000000000000000000' }, 'Unsigned signing bytes/hash are the published primary EIP155 example. Our optional signature uses public scalar1, NOT the EIP example scalar0x46..46.')
const publishedEip155 = evm.at(-1)
if (publishedEip155.unsignedSerialized !== '0xec098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a764000080018080' || publishedEip155.context.digest !== 'daf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53') throw new Error('Independent SDK disagrees with published EIP155 example')
publishedEip155.provenance = 'Primary EIP155 unsigned signing data and digest, https://eips.ethereum.org/EIPS/eip-155; independently reproduced by pinned ethers. Optional signature is synthetic public scalar1, not copied from EIP155.'

evmVector('evm-contract-creation-known-selector-raw', { ...common, to: null, value: 0n, gasLimit: 100000n, data: transferData }, { kind: 'raw', reason: 'Contract initcode happens to equal canonical ERC20 calldata; creation has no called contract and must not be decoded as transfer.' }, 'Same ABI-shaped bytes as a transfer, but transaction target is creation; raw semantics must follow the actual envelope.')
const legacyZero = evm.find(v => v.id === 'evm-eth-legacy-zero-nonce')
const evmNegative = ['maxFeePerGas', 'maxPriorityFeePerGas'].map(field => ({
  id: `evm-legacy-forbidden-${field}-zero`,
  context: { ...legacyZero.context, unsignedTransaction: { ...legacyZero.context.unsignedTransaction, [field]: '0' } },
  expected: { action: 'reject', reason: 'Explicit legacy type forbids EIP1559 field presence even when zero. Digest is the independent correct legacy-envelope hash, not an unrelated mismatch.' },
}))

const fixture = {
  schemaVersion: 1, publicFixturesOnly: true,
  warning: 'PUBLISHED UNSAFE TEST KEYS. NEVER FUND. Offline synthetic fixtures, not blockchain acceptance. No real Vault state, browser profile, service, RPC, external token metadata, or ALT resolution is used.',
  provenance: {
    sources: [
      { name: 'EIP155 published unsigned signing data and hash', url: 'https://eips.ethereum.org/EIPS/eip-155' },
      { name: 'RFC8032 section 7.1 TEST 1 and TEST 2 seed/public key constants', url: 'https://www.rfc-editor.org/rfc/rfc8032#section-7.1' },
      { name: '@solana/web3.js official SDK', version: '1.98.4', gitHead: 'c26c13bf841821d9bbf83bb476c567fe29d13821', integrity: 'sha512-vv9lfnvjUsRiq//+j5pBdXig0IQdtzA0BRZ3bXEP4KaIyF1CcaydWqgyzQgfZMNIsWNWmG+AUHwPy4AHOD6gpw==' },
      { name: '@solana/spl-token official instruction constructors', version: '0.4.14', integrity: 'sha512-u09zr96UBpX4U685MnvQsNzlvw9TiY005hk1vJmJr7gMJldoPG1eYU5/wNEyOA5lkMLiR/gOi9SFD4MefOYEsA==' },
      { name: 'ethers independent EVM SDK', version: '6.15.0', gitHead: '9944ec94b154b4f8fdfeefb81a1e47b28fd907bc', integrity: 'sha512-Kf/3ZW54L4UT0pZtsY/rf+EkBU7Qi5nnhonjUb8yTXcxH3cdcWrV2cRyk0Xk/4jK6OoHhxxZHriyhje20If2hQ==' },
    ],
    serialization: 'Pinned official Solana SDK and SPL constructors; ethers for EVM, not production viem.',
    ed25519: 'Node native node:crypto Ed25519 (OpenSSL), signing exact serialized message, not a digest; verified independently by repository noble/curves in verify.test.ts.',
    expectedSemantics: 'Explicit construction arguments in this independent generator, never production parser output. Wire offsets are independent indexing of valid SDK output solely for negative mutations.',
    network: 'None. Invented recent blockhash; invented non-ATA token addresses; no node acceptance or funding claim.',
    generatorSha256: sha256(readFileSync(new URL(import.meta.url))),
    dependencyLockSha256: sha256(readFileSync(`${fixturesDir}package-lock.json`)),
  },
  keys: rfc.map(({ id, seedHex, publicKeyHex, publicKeyBase58 }) => ({ id, seedHex, publicKeyHex, publicKeyBase58 })),
  programIds: { system: SystemProgram.programId.toBase58(), splToken: TOKEN_PROGRAM_ID.toBase58(), token2022: TOKEN_2022_PROGRAM_ID.toBase58(), computeBudget: ComputeBudgetProgram.programId.toBase58(), memo: memoProgram.toBase58(), jupiter: jupiterProgram.toBase58() },
  blindSigningNotice: { en: 'Some content is not decoded; approving it is blind signing.', zh: '部分内容未解析，批准即为盲签。' },
  solana, negative, signerChecks, evm, evmNegative,
}
const output = `${JSON.stringify(fixture, null, 2)}\n`
if (process.argv.includes('--check')) {
  if (readFileSync(corpusPath, 'utf8') !== output) throw new Error('Corpus differs from independent generator output; regenerate and inspect.')
  console.log(`Verified deterministic public corpus: ${solana.length} Solana, ${negative.length} rejection mutations, ${signerChecks.length} signer negatives, ${evm.length} EVM and ${evmNegative.length} EVM negatives; SHA256 ${sha256(Buffer.from(output))}`)
} else {
  writeFileSync(corpusPath, output)
  console.log(`Wrote ${corpusPath}: ${solana.length} Solana, ${negative.length} rejection mutations, ${signerChecks.length} signer negatives, ${evm.length} EVM and ${evmNegative.length} EVM negatives; SHA256 ${sha256(Buffer.from(output))}`)
}
