export interface IBinanceFuturesOrder {
  price: string
  symbol: string
  id: number
  side: string
  size?: number
}

export interface IBinanceFuturesDepthStream {
  stream: string
  data: {
    bids: string[][]
    asks: string[][]
  }
}

export interface IBinanceFuturesBalance {
  accountAlias: string
  asset: string
  balance: string
  withdrawAvailable: string
  updateTime: number
}

export interface IBinanceFuturesOpenOrder {
  orderId: number
  symbol: string
  status: string
  clientOrderId: string
  price: string
  avgPrice: string
  origQty: string
  executedQty: string
  cumQuote: string
  timeInForce: string
  type: string
  reduceOnly: false
  side: string
  stopPrice: string
  workingType: string
  origType: string
  time: number
  updateTime: number
}
