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
    "unlock.sessionTitle": "Unlock vault",
    "unlock.sessionSubtitle": "Available in this browser for {{minutes}} min",
    "unlock.sessionBody": "Use your passkey once. While the vault stays unlocked, access requests only need confirmation; signing still verifies your passkey every time.",
    "plaintext.copyTitle": "Copy protected value",
    "plaintext.title": "Protected value",
    "plaintext.body": "The plaintext is visible only in this sandbox frame.",
    "plaintext.copy": "Copy",
    "plaintext.copyWarning": "Copying puts plaintext on the system clipboard, where other apps or pages may read it.",
    "plaintext.copyReady": "Passkey confirmed. Click Copy again to write to clipboard.",
    "plaintext.copyFailed": "Copy was not completed. The value remains visible here.",
    "plaintext.copiedBody": "Copied from the sandbox frame. The plaintext was not returned to Avibe.",
    "reveal.showConfirmTitle": "Show protected value",
    "reveal.confirmBody": "Confirm in this sandbox to display the value here. The plaintext will not be returned to Avibe.",
    "sign.title": "Sign protected operation",
    "sign.confirm": "Confirm sign",
    "release.title": "Release protected access",
    "release.subtitle": "{{count}} protected item(s)",
    "release.confirm": "Confirm release",
    "context.session": "Session",
    "context.command": "Command",
    "context.egress": "Egress",
    "context.source": "Source",
    "context.sourceEnv": "env",
    "context.sourceTag": "tag",
    "context.sourceSkill": "skill",
    "context.agent": "Agent",
    "context.grant": "Grant",
    "context.agentAccess": "Agent access",
    "context.secrets": "Secrets",
    "context.kindStatic": "static",
    "context.kindKeypair": "keypair",
    "context.oneTime": "one-time",
    "context.minutes": "{{count}} min",
    "context.seconds": "{{count}} sec",
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
    "unlock.sessionTitle": "解锁保险库",
    "unlock.sessionSubtitle": "本浏览器内保持 {{minutes}} 分钟",
    "unlock.sessionBody": "使用一次 Passkey 解锁。解锁期间，普通授权只需确认；签名仍会每次验证 Passkey。",
    "plaintext.copyTitle": "复制保护档值",
    "plaintext.title": "保护档值",
    "plaintext.body": "明文只会在这个沙箱窗口里显示。",
    "plaintext.copy": "复制",
    "plaintext.copyWarning": "复制会把明文放到系统剪贴板，其他应用或页面可能读取。",
    "plaintext.copyReady": "passkey 已确认。再次点击「复制」写入剪贴板。",
    "plaintext.copyFailed": "复制未完成。明文仍只显示在这里。",
    "plaintext.copiedBody": "已从沙箱窗口复制。明文没有交给 Avibe。",
    "reveal.showConfirmTitle": "显示保护档值",
    "reveal.confirmBody": "在沙箱里确认后，只在这里显示明文。明文不会交给 Avibe。",
    "sign.title": "签名保护档操作",
    "sign.confirm": "确认签名",
    "release.title": "批准保护档访问",
    "release.subtitle": "{{count}} 个保护档项目",
    "release.confirm": "确认批准",
    "context.session": "会话",
    "context.command": "命令",
    "context.egress": "外联",
    "context.source": "来源",
    "context.sourceEnv": "环境变量",
    "context.sourceTag": "标签",
    "context.sourceSkill": "技能",
    "context.agent": "Agent",
    "context.grant": "授权",
    "context.agentAccess": "Agent 授权时长",
    "context.secrets": "保护档",
    "context.kindStatic": "静态值",
    "context.kindKeypair": "签名密钥",
    "context.oneTime": "一次性",
    "context.minutes": "{{count}} 分钟",
    "context.seconds": "{{count}} 秒",
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
