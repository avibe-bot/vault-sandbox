// The verbatim region of src/hdPhrase.ts and its pinned digest.
export function vendoredHdPhraseRegion(text) {
  const match = text.match(/\/\/ BEGIN VENDORED vaultHdWallet\.ts sha256:([0-9a-f]{64})\n([\s\S]*?)\/\/ END VENDORED\n$/)
  if (!match) throw new Error("hdPhrase.ts vendored region markers are missing")
  return { pinned: match[1], region: match[2] }
}
