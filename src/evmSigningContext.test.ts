import { afterEach, describe, expect, it } from "vitest"
import { encodeFunctionData, hashTypedData, keccak256, parseAbi, parseTransaction, serializeTransaction } from "viem"
import { setLocale } from "./i18n"
import { verifySigningContext, type VerifiableSigningContext } from "./signingContext"

// Public, unfunded example addresses only. No user key signs anything here.
const TOKEN = "0x000000000000000000000000000000000000c0Fe"
const DEAD = "0x000000000000000000000000000000000000dEaD"
const BEEF = "0x000000000000000000000000000000000000bEEF"
const BLIND_EN = "Some content is not decoded; approving it is blind signing."
const BLIND_ZH = "部分内容未解析，批准即为盲签。"

const abi = parseAbi([
  "function approve(address spender,uint256 amount)",
  "function transfer(address to,uint256 amount)",
  "function transferFrom(address from,address to,uint256 amount)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function safeTransferFrom(address from,address to,uint256 tokenId)",
  "function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)",
])

type Tx = Record<string, unknown>

function jsonTx(tx: Tx): Tx {
  return JSON.parse(JSON.stringify(tx, (_key, value) => (typeof value === "bigint" ? value.toString() : value)))
}

function context(tx: Tx, overrides: Partial<{ chainId: string; digest: string }> = {}): VerifiableSigningContext {
  const json = jsonTx(tx)
  const digest = overrides.digest ?? keccak256(serializeTransaction(tx as Parameters<typeof serializeTransaction>[0]))
  return { kind: "evm-transaction", chainId: overrides.chainId ?? "1", unsignedTransaction: json, digestAlgorithm: "keccak256", digest }
}

function eip1559(data: string | undefined, extra: Tx = {}): Tx {
  return { chainId: 1, type: "eip1559", to: TOKEN, value: 0n, nonce: 7, gas: 90_000n, maxFeePerGas: 30n, maxPriorityFeePerGas: 2n, ...(data === undefined ? {} : { data }), ...extra }
}

function verify(tx: Tx) {
  const verified = verifySigningContext(context(tx))
  expect(verified.evm).toBeDefined()
  return { ...verified, evm: verified.evm! }
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function expectBlindRaw(data: string) {
  const verified = verify(eip1559(data))
  expect(verified.evm.decoded).toBeNull()
  expect(verified.evm.blindSigning).toBe(true)
  expect(verified.evm.calldata).toBe(data.toLowerCase())
  expect(verified.evm.calldataBytes).toBe((data.length - 2) / 2)
  expect(verified.evm.selector).toBe(data.slice(0, Math.min(10, data.length)).toLowerCase())
  expect(occurrences(verified.display, BLIND_EN)).toBe(1)
  expect(verified.display).toContain(data.toLowerCase())
  expect(verified.display).not.toContain("call:")
  return verified
}

afterEach(() => { setLocale("en") })

describe("EVM raw calldata fallback", () => {
  it("makes a valid unknown selector signable after one blind-signing notice, with every raw field", () => {
    const data = `0x12345678${"00".repeat(31)}2a${"ff".repeat(5)}`
    const verified = expectBlindRaw(data)
    expect(verified.evm).toMatchObject({ chainId: "1", type: "eip1559", to: TOKEN, value: "0", nonce: "7", gas: "90000", maxFeePerGas: "30", maxPriorityFeePerGas: "2", selector: "0x12345678" })
    expect(verified.display).toContain(`to: ${TOKEN}`)
    expect(verified.display).toContain("value: 0 wei")
    expect(verified.display).toContain("selector: 0x12345678")
    expect(verified.display).toContain(`calldata (${verified.evm.calldataBytes} bytes, complete): ${data}`)
  })

  it.each(["0x12", "0x1234", "0x123456", "0x12345678"])("treats short nonempty calldata %s as raw with its leading bytes as selector", (data) => {
    expectBlindRaw(data)
  })

  it("keeps empty calldata as a decoded native value transfer without a notice", () => {
    for (const data of [undefined, "0x"]) {
      const verified = verify(eip1559(data, { to: DEAD, value: 10n ** 18n }))
      expect(verified.evm).toMatchObject({ to: DEAD, value: "1000000000000000000", selector: null, calldata: "0x", calldataBytes: 0, decoded: null, blindSigning: false })
      expect(verified.display).not.toContain(BLIND_EN)
      expect(verified.display).toContain("selector: none")
      expect(verified.display).toContain("calldata: none")
    }
  })

  it("never truncates large raw calldata", () => {
    const data = `0xdeadbeef${"0123456789abcdef".repeat(1024)}`
    const verified = expectBlindRaw(data)
    expect(verified.evm.calldata).toBe(data)
    expect(verified.evm.calldataBytes).toBe(4 + 8 * 1024)
  })

  it("normalizes uppercase hex to the same bytes without changing the signed digest", () => {
    const data = "0xABCDEF0123"
    const verified = expectBlindRaw(data)
    expect(verified.evm.calldata).toBe("0xabcdef0123")
    expect(verified.digest).toBe(keccak256(serializeTransaction(eip1559(data) as never)).slice(2))
  })

  it("truthfully reviews contract creation init code as raw", () => {
    const initCode = "0x6080604052348015600f57600080fd5b50"
    for (const to of [undefined, null, ""]) {
      const tx = { ...eip1559(initCode), to }
      if (to === undefined) delete tx.to
      const verified = verify(tx)
      expect(verified.evm.to).toBeNull()
      expect(verified.evm.blindSigning).toBe(true)
      expect(verified.evm.calldata).toBe(initCode)
      expect(verified.display).toContain("to: (contract creation)")
      expect(verified.display).not.toContain(`to: ${TOKEN}`)
    }
  })

  it("never ABI-interprets contract creation init code, even when it equals a known canonical call", () => {
    const initCode = encodeFunctionData({ abi, functionName: "transfer", args: [DEAD, 5n] })
    const tx = { ...eip1559(initCode) }
    delete tx.to
    const verified = verify(tx)
    expect(verified.evm).toMatchObject({ to: null, decoded: null, blindSigning: true, selector: "0xa9059cbb", calldata: initCode })
    expect(occurrences(verified.display, BLIND_EN)).toBe(1)
    expect(verified.display).not.toContain("call:")
    expect(verified.display).not.toContain("ERC-20 transfer")
  })

  it("shows serialized zero defaults instead of omitting absent nonce, value and gas", () => {
    const verified = verify({ chainId: 1, type: "legacy", to: DEAD, gasPrice: 5n })
    expect(verified.evm).toMatchObject({ type: "legacy", nonce: "0", value: "0", gas: "0", gasPrice: "5" })
    expect(verified.evm.maxFeePerGas).toBeUndefined()
    for (const line of ["nonce: 0", "value: 0 wei", "gas: 0", "gasPrice: 5 wei"]) expect(verified.display).toContain(line)
    expect(verified.display).not.toContain("maxFeePerGas")
  })

  it("localizes the notice and raw labels", () => {
    setLocale("zh")
    const verified = verify(eip1559("0x12345678"))
    expect(occurrences(verified.display, BLIND_ZH)).toBe(1)
    expect(verified.display).toContain("函数选择器：0x12345678")
    expect(verified.display).toContain("calldata（4 字节，完整）：0x12345678")
    expect(verified.display).not.toContain(BLIND_EN)
  })
})

describe("built-in EVM decoders stay unchanged and keep raw evidence", () => {
  const r = `0x${"11".repeat(32)}` as const
  const s = `0x${"22".repeat(32)}` as const
  it.each([
    ["approve", "approve", [DEAD, 123n], "approve(address,uint256)"],
    ["transfer", "transfer", [DEAD, 5n], "transfer(address,uint256)"],
    ["transferFrom", "transferFrom", [BEEF, DEAD, 9n], "transferFrom(address,address,uint256)"],
    ["permit", "permit", [BEEF, DEAD, 1n, 2n, 27, r, s], "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"],
    ["setApprovalForAll", "setApprovalForAll", [DEAD, true], "setApprovalForAll(address,bool)"],
    ["safeTransferFrom", "safeTransferFrom", [BEEF, DEAD, 77n], "safeTransferFrom(address,address,uint256)"],
    ["safeTransferFromWithData", "safeTransferFrom", [BEEF, DEAD, 77n, "0xc0ffee"], "safeTransferFrom(address,address,uint256,bytes)"],
  ] as const)("decodes canonical %s with every argument and the complete calldata", (call, functionName, args, signature) => {
    const data = encodeFunctionData({ abi, functionName, args } as never)
    const verified = verify(eip1559(data))
    expect(verified.evm.blindSigning).toBe(false)
    expect(verified.display).not.toContain(BLIND_EN)
    expect(verified.evm.decoded).toMatchObject({ call, signature })
    expect(verified.evm.decoded!.arguments).toHaveLength(args.length)
    expect(verified.evm.decoded!.arguments.map((argument) => argument.value.toLowerCase())).toEqual(args.map((arg) => String(arg).toLowerCase()))
    expect(verified.evm.selector).toBe(data.slice(0, 10))
    expect(verified.evm.calldata).toBe(data)
    expect(verified.display).toContain(`call: `)
    expect(verified.display).toContain(signature)
    expect(verified.display).toContain(data)
  })

  it("keeps permit v, r and s inspectable instead of hiding unshown arguments", () => {
    const data = encodeFunctionData({ abi, functionName: "permit", args: [BEEF, DEAD, 1n, 2n, 28, `0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`] })
    const verified = verify(eip1559(data))
    expect(verified.display).toContain("  v (uint8): 28")
    expect(verified.display).toContain(`  r (bytes32): 0x${"11".repeat(32)}`)
    expect(verified.display).toContain(`  s (bytes32): 0x${"22".repeat(32)}`)
  })

  const approve = encodeFunctionData({ abi, functionName: "approve", args: [DEAD, 5n] })
  const approval = encodeFunctionData({ abi, functionName: "setApprovalForAll", args: [DEAD, true] })
  const withData = encodeFunctionData({ abi, functionName: "safeTransferFrom", args: [BEEF, DEAD, 1n, "0xc0ffee"] })
  it.each([
    ["one trailing byte", `${approve}ff`],
    ["a trailing word", `${approve}${"00".repeat(32)}`],
    ["dirty address high bits", `${approve.slice(0, 10)}ff${approve.slice(12)}`],
    ["truncated arguments", approve.slice(0, -2)],
    ["selector only", approve.slice(0, 10)],
    ["non-boolean bool word", `${approval.slice(0, -2)}02`],
    ["noncanonical dynamic offset", `${withData.slice(0, 10 + 64 * 3)}${"00".repeat(31)}a0${"00".repeat(32)}${withData.slice(10 + 64 * 4)}`],
    ["dirty bytes padding", `${withData.slice(0, -2)}01`],
  ])("reviews a known selector with %s as raw instead of a decoded summary", (_name, data) => {
    // These would otherwise decode silently (or fail) under a lenient ABI decoder.
    const verified = expectBlindRaw(data)
    expect(verified.evm.selector).toBe(data.slice(0, 10))
  })
})

describe("EVM envelope, hash and chain binding stay strict", () => {
  it("binds the public EIP-155 example signing hash", () => {
    // EIP-155 example: nonce 9, 20 gwei, 21000 gas, to 0x3535..., 1 ether, chain 1.
    const tx = { chainId: 1, type: "legacy", nonce: 9, gasPrice: 20n * 10n ** 9n, gas: 21_000n, to: "0x3535353535353535353535353535353535353535", value: 10n ** 18n }
    const verified = verifySigningContext(context(tx, { digest: "0xdaf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53" }))
    expect(verified.digest).toBe("daf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53")
    // EIP-155 published signing data for the same example.
    expect(verified.evm?.unsignedTransactionHex).toBe("0xec098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a764000080018080")
    expect(verified.evm?.blindSigning).toBe(false)
  })

  it("exposes the exact serialized unsigned transaction whose keccak256 is the digest", () => {
    const verified = verify(eip1559("0x12345678"))
    expect(verified.evm.unsignedTransactionHex).toBe(serializeTransaction(eip1559("0x12345678") as never))
    expect(keccak256(verified.evm.unsignedTransactionHex as `0x${string}`).slice(2)).toBe(verified.digest)
  })

  it.each([
    ["zero maxFeePerGas and maxPriorityFeePerGas", { maxFeePerGas: 0n, maxPriorityFeePerGas: 0n }],
    ["zero maxFeePerGas", { maxFeePerGas: 0n }],
    ["zero maxPriorityFeePerGas", { maxPriorityFeePerGas: 0n }],
  ])("rejects an explicit legacy envelope carrying %s even when viem serializes it as legacy with a matching digest", (_name, fees) => {
    const tx = { chainId: 1, type: "legacy", to: "0x0000000000000000000000000000000000000001", gas: 21_000n, nonce: 0, value: 0n, data: "0x12345678", ...fees }
    const serialized = serializeTransaction(tx as never)
    if (Object.keys(fees).length === 2) expect(serialized).toBe("0xe38080825208940000000000000000000000000000000000000001808412345678018080")
    expect(parseTransaction(serialized).type).toBe("legacy")
    expect(() => verifySigningContext(context(tx, { digest: keccak256(serialized) }))).toThrow(/legacy transaction cannot carry/)
  })

  it("infers EIP-1559 from zero-valued fee fields when type is absent, matching serialization", () => {
    const tx = { chainId: 1, to: DEAD, maxFeePerGas: 0n, data: "0x12345678" }
    const verified = verify(tx)
    expect(parseTransaction(verified.evm.unsignedTransactionHex as `0x${string}`).type).toBe("eip1559")
    expect(verified.evm).toMatchObject({ type: "eip1559", maxFeePerGas: "0", maxPriorityFeePerGas: "0" })
    expect(verified.evm.gasPrice).toBeUndefined()
  })

  it("rejects digest and chain mismatches for raw calldata too", () => {
    const tx = eip1559("0x12345678")
    expect(() => verifySigningContext(context(tx, { digest: `0x${"00".repeat(32)}` }))).toThrow(/digest does not match/)
    expect(() => verifySigningContext(context(tx, { chainId: "5" }))).toThrow(/chain id mismatch/)
    expect(() => verifySigningContext(context({ ...tx, data: "0x12345679" }, { digest: verifySigningContext(context(tx)).digest }))).toThrow(/digest does not match/)
  })

  it.each([
    ["odd length", "0x123"],
    ["non-hex", "0x12zz"],
    ["missing 0x", "12345678"],
    ["uppercase prefix", "0X12345678"],
    ["number", 1234],
  ])("still rejects malformed calldata: %s", (_name, data) => {
    const ctx = context(eip1559(undefined), {})
    ;(ctx as { unsignedTransaction: Tx }).unsignedTransaction.data = data
    expect(() => verifySigningContext(ctx)).toThrow()
  })

  it.each([
    ["unknown field", { foo: "bar" }],
    ["accessList", { accessList: [] }],
    ["authorizationList", { authorizationList: [] }],
    ["blob fields", { maxFeePerBlobGas: "1", blobVersionedHashes: [`0x${"01".repeat(32)}`] }],
    ["eip2930 type", { type: "eip2930" }],
    ["eip7702 type", { type: "eip7702" }],
    ["unsigned gasPrice on EIP-1559", { gasPrice: "1" }],
    ["zero gasPrice on EIP-1559", { gasPrice: "0" }],
  ])("still rejects unsupported envelope: %s", (_name, extra) => {
    const ctx = context(eip1559("0x12345678"))
    Object.assign((ctx as { unsignedTransaction: Tx }).unsignedTransaction, extra)
    expect(() => verifySigningContext(ctx)).toThrow()
  })

  it("keeps EIP-712 typed data free of EVM transaction review", () => {
    const typedData = {
      domain: { name: "Sandbox Test", version: "1", chainId: 1, verifyingContract: DEAD },
      types: { Mail: [{ name: "contents", type: "string" }] },
      primaryType: "Mail",
      message: { contents: "hello" },
    }
    const verified = verifySigningContext({ kind: "eip-712-typed-data", typedData, digestAlgorithm: "eip712", digest: hashTypedData(typedData as never) })
    expect(verified.evm).toBeUndefined()
    expect(verified.display).toContain("EIP-712 typed data")
  })
})
