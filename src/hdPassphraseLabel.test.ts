import { afterEach, describe, expect, it } from "vitest"
import { setLocale, t } from "./i18n"

// Creating and importing a seed wallet name the passphrase one way (3.2.8): the import section is
// titled with the create field's own label, never "BIP39 passphrase" or "BIP39 密码".
describe("passphrase label", () => {
  afterEach(() => { setLocale("en") })

  it.each(["en", "zh"])("%s: create and import name it the same way", (locale) => {
    setLocale(locale)
    expect(t("hd.importPassphrase").startsWith(t("hd.passphraseLabel"))).toBe(true)
    expect(t("hd.importPassphrase")).not.toMatch(/BIP39/)
  })
})
