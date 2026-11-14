// What THIS compiled sandbox build actually implements for protected Bitcoin.
// It is source, reviewed and pinned with the build: never a runtime flag, a
// requester parameter or an inference from stored public points. The parent's
// pin registry maps the exact packaged pin to the same facts; this constant lets
// the sandbox refuse to render or sign what its own code cannot verify.
export type BitcoinAddressType = "p2pkh" | "p2wpkh" | "p2tr"

export const COMPILED_BITCOIN_SUPPORT = Object.freeze({
  // Groundwork alone is not signing capability. Extend only after the actual
  // authenticated fresh-UV/sign/closure path is wired and verified on default.
  ordinaryInputTypes: Object.freeze(["p2tr"] as const),
})

export type BitcoinSupport = { ordinaryInputTypes: readonly BitcoinAddressType[] }

/** A protected ordinary secp policy target names all three forms; the build must verify all three. */
export function supportsAllProtectedOrdinaryForms(support: BitcoinSupport = COMPILED_BITCOIN_SUPPORT): boolean {
  return (["p2pkh", "p2wpkh", "p2tr"] as const).every((type) => support.ordinaryInputTypes.includes(type))
}
