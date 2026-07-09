const STRINGS = {
  en: {
    "common.cancel": "Cancel",
    "common.continue": "Continue",
    "common.done": "Done",
    "setup.title": "Create vault passkey",
    "setup.subtitle": "Protected vault setup",
    "setup.iframeBody": "Create a passkey in this sandbox frame. Your vault key stays on this origin.",
    "setup.topLevelBody": "Confirm to create a resident passkey on this sandbox origin. Your vault key stays in this browser.",
    "setup.createPasskey": "Create passkey",
    "setup.finish": "Finish setup",
    "setup.ready": "Ready.",
    "setup.readyOnOrigin": "Ready on this origin.",
    "setup.popupBlocked": "Popup was blocked. Tap Create passkey again.",
    "setup.popupPrompt": "Create the passkey in the new window.",
    "setup.createdFinish": "Passkey created. Tap Finish setup to continue.",
    "setup.passkeyPrompt": "Follow your browser passkey prompt...",
    "setup.requestMissing": "Setup request is missing.",
    "setup.requestInvalid": "Setup request is invalid.",
    "setup.created": "Passkey created.",
    "seal.keypairTitle": "Create signing key",
    "seal.staticTitle": "Seal protected value",
    "seal.subtitle": "Sandbox-owned input",
    "seal.keypairBody": "Generate a fresh key here, or paste a private key. The private key never leaves this sandbox.",
    "seal.staticBody": "Enter the protected value here. It will be encrypted before Avibe receives anything.",
    "seal.privateKeyPlaceholder": "Optional 32-byte private key hex",
    "seal.generateAndSealKey": "Generate and seal key",
    "seal.sealPastedKey": "Seal pasted key",
    "seal.invalidPrivateKey": "Invalid private key.",
    "seal.sealValue": "Seal value",
    "plaintext.copyTitle": "Copy protected value",
    "plaintext.title": "Protected value",
    "plaintext.body": "The plaintext is visible only in this sandbox frame.",
    "plaintext.copiedBody": "Copied from the sandbox frame. The plaintext was not returned to Avibe.",
    "unseal.copyConfirmTitle": "Copy protected value",
    "unseal.showConfirmTitle": "Show protected value",
    "unseal.confirmBody": "Confirm in this sandbox, then complete the passkey prompt. The plaintext will not be returned to Avibe.",
    "sign.title": "Sign protected operation",
    "sign.confirm": "Confirm sign",
    "release.title": "Release protected access",
    "release.body": "Grant {{grantId}}\nRequest {{requestId}}\nExpires {{expiresAt}}",
    "release.confirm": "Confirm release",
  },
  zh: {
    "common.cancel": "取消",
    "common.continue": "继续",
    "common.done": "完成",
    "setup.title": "创建保险库 passkey",
    "setup.subtitle": "保护档设置",
    "setup.iframeBody": "在这个沙箱窗口里创建 passkey。保险库密钥只留在这里。",
    "setup.topLevelBody": "确认在沙箱域名上创建 passkey。保险库密钥只留在这个浏览器里。",
    "setup.createPasskey": "创建 passkey",
    "setup.finish": "完成设置",
    "setup.ready": "准备好了。",
    "setup.readyOnOrigin": "当前域名已准备好。",
    "setup.popupBlocked": "弹窗被拦截了。再点一次创建 passkey。",
    "setup.popupPrompt": "请在新窗口里创建 passkey。",
    "setup.createdFinish": "passkey 已创建。点「完成设置」继续。",
    "setup.passkeyPrompt": "请按浏览器里的 passkey 提示操作…",
    "setup.requestMissing": "缺少设置请求。",
    "setup.requestInvalid": "设置请求无效。",
    "setup.created": "passkey 已创建。",
    "seal.keypairTitle": "创建签名密钥",
    "seal.staticTitle": "封存保护档值",
    "seal.subtitle": "沙箱内输入",
    "seal.keypairBody": "在这里生成新密钥，或粘贴私钥。私钥不会离开这个沙箱。",
    "seal.staticBody": "在这里输入保护档值。它会先加密，Avibe 只拿到密文。",
    "seal.privateKeyPlaceholder": "可选：32 字节私钥十六进制",
    "seal.generateAndSealKey": "生成并封存",
    "seal.sealPastedKey": "封存粘贴的密钥",
    "seal.invalidPrivateKey": "私钥无效。",
    "seal.sealValue": "封存值",
    "plaintext.copyTitle": "复制保护档值",
    "plaintext.title": "保护档值",
    "plaintext.body": "明文只会在这个沙箱窗口里显示。",
    "plaintext.copiedBody": "已从沙箱窗口复制。明文没有交给 Avibe。",
    "unseal.copyConfirmTitle": "复制保护档值",
    "unseal.showConfirmTitle": "显示保护档值",
    "unseal.confirmBody": "在沙箱里确认后，再完成 passkey 提示。明文不会交给 Avibe。",
    "sign.title": "签名保护档操作",
    "sign.confirm": "确认签名",
    "release.title": "批准保护档访问",
    "release.body": "授权 {{grantId}}\n请求 {{requestId}}\n到期 {{expiresAt}}",
    "release.confirm": "确认批准",
  },
} as const

export type Locale = keyof typeof STRINGS
export type I18nKey = keyof typeof STRINGS.en
export type I18nParams = Record<string, string | number | boolean | null | undefined>

let currentLocale: Locale = "en"

export function normalizeLocale(locale: unknown): Locale {
  return locale === "zh" ? "zh" : "en"
}

export function setLocale(locale: unknown): boolean {
  const next = normalizeLocale(locale)
  if (next === currentLocale) return false
  currentLocale = next
  return true
}

export function getLocale(): Locale {
  return currentLocale
}

export function t(key: I18nKey | string, params: I18nParams = {}): string {
  const table = STRINGS[currentLocale] as Record<string, string>
  const fallback = STRINGS.en as Record<string, string>
  const template = table[key] ?? fallback[key] ?? key
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? ""))
}

function paramsJson(params?: I18nParams): string {
  return JSON.stringify(params ?? {})
}

function parseParams(value?: string): I18nParams {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function bindText(element: HTMLElement, key: I18nKey, params?: I18nParams): void {
  element.dataset.i18nKey = key
  element.dataset.i18nParams = paramsJson(params)
  element.textContent = t(key, params)
}

export function setRawText(element: HTMLElement, text: string): void {
  delete element.dataset.i18nKey
  delete element.dataset.i18nParams
  element.textContent = text
}

export function bindPlaceholder(element: HTMLInputElement | HTMLTextAreaElement, key: I18nKey, params?: I18nParams): void {
  element.dataset.i18nPlaceholderKey = key
  element.dataset.i18nPlaceholderParams = paramsJson(params)
  element.placeholder = t(key, params)
}

export function setRawPlaceholder(element: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  delete element.dataset.i18nPlaceholderKey
  delete element.dataset.i18nPlaceholderParams
  element.placeholder = text
}

export function refreshI18nBindings(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n-key]").forEach((element) => {
    const key = element.dataset.i18nKey as I18nKey | undefined
    if (key) element.textContent = t(key, parseParams(element.dataset.i18nParams))
  })
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-placeholder-key]").forEach((element) => {
    const key = element.dataset.i18nPlaceholderKey as I18nKey | undefined
    if (key) element.placeholder = t(key, parseParams(element.dataset.i18nPlaceholderParams))
  })
}
