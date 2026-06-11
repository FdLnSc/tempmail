export const TEMPMAIL_DOMAINS = ['fdlnstore.com', 'fdlns.me', 'fdlnstore.app'] as const

export type TempMailDomain = (typeof TEMPMAIL_DOMAINS)[number]

export const DEFAULT_TEMPMAIL_DOMAIN: TempMailDomain = TEMPMAIL_DOMAINS[0]

export function isTempMailDomain(domain: string): domain is TempMailDomain {
  return TEMPMAIL_DOMAINS.includes(domain as TempMailDomain)
}

export function getDomainFromEmail(email: string): TempMailDomain | null {
  const domain = email.split('@').pop()?.toLowerCase()
  return domain && isTempMailDomain(domain) ? domain : null
}
