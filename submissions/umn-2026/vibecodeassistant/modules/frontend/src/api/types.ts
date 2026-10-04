export type ApiMode = 'mock'

export interface ApiConfig {
  baseUrl: string
  mode: ApiMode
}

export const apiConfig: ApiConfig = {
  baseUrl: 'mock',
  mode: 'mock',
}
