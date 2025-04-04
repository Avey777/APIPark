export interface LoadBalancingItems {
  id: string
  priority: string
  provider: {
    id: string
    name: string
  }
  model: {
    id: string
    name: string
  }
  type: string
  state: string
  apiCount: string
  keyCount: string
}

export interface LoadModelDetailData {
  type: string
  provider: string
  model: string
}
export interface LocalLlmType {
  id: string
  name: string
  defaultConfig: string
}

export type LoadBalancingHandle = {
  save: () => Promise<boolean | string>
}
