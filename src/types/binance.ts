import ccxt from 'ccxt'
export interface IBinanceDepthStream {
  stream: string
  data: {
    bids: string[][]
    asks: string[][]
  }
}
// margin
export interface IBinanceMarginResult {
  success: boolean
}

export interface IBinanceMarginAsset {
  [currency: string]: {
    borrowed: number
    free: number
    netAsset: number
    leverage: number
  }
}

export interface ITransaction extends ccxt.Transaction {
  tag?: string
}

export enum MarginTransferType {
  MainToMargin = 1,
  MarginToMain = 2
}
