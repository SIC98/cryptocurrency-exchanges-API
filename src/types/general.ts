import { Observable } from 'rxjs'
import * as WS from 'websocket'

export enum ExchangeName {
  Binance = 'Binance',
  Bybit = 'Bybit',
  BinanceFutures = 'BinanceFutures',
  Bitmex = 'Bitmex'
}
export interface IOrderbookByExchange {
  [exchangeName: string]: IOrderbook
}

export interface IOrder {
  p: number // price
  v: number // volume
}
export interface IOrderbookData {
  asks: IOrder[]
  bids: IOrder[]
}
export interface IOrderbook extends IOrderbookData {
  exchangeName: string
  marketString: string
  timestamp: Date
}

export interface IMyBalance {
  [currency: string]: {
    balance: number
    available?: number
  }
}
export interface IWithdrawParams {
  currency: string
  toAddress: ITransactionAddress
  amount: number
  fee?: number
  timestamp?: Date
  fromAddress?: ITransactionAddress
  otpToken?: string
  id?: string
  password?: string
}
export interface ITransactionResult {
  currency: string
  fromAddress: ITransactionAddress
  toAddress: ITransactionAddress
  amount: number
  timestamp: Date
  fee?: number
  txid?: string
}

export interface ITransactionAddress {
  address: string
  currency?: string
  optionalAddress?: string
  exchange?: ExchangeName
}

export enum OrderSide {
  Buy = 'buy',
  Sell = 'sell'
}
export enum OrderType {
  Market,
  Limit
}

export interface IOrderParams {
  orderType: OrderType
  marketString: string
  side: OrderSide
  price?: number
  volume: number
}

export interface IOrderResult {
  orderId: number | string
  marketString: string
  price: number
  volume: number
  createdAt?: Date
}
export interface ICancelOrderResult {
  success: boolean
}
export interface IOrderStatus {
  orderId: number | string
  orderStatus: string
  side: OrderSide
  price: number
  volume: number
  remainingVolume: number
}

export interface IMyPosition {
  symbol: string
  baseSize: number
  quoteSize?: number
  unrealizedPnl: number
  entryPrice: number
  marginType: MarginType
  leverage: number
  liquidationPrice: number
}

export enum MarginType {
  CrossMargin,
  IsolatedMargin
}

export interface IPureObject {
  [key: string]: string | number | string[] //string | number | boolean
}

export interface IWebSocketOptions {
  name?: string
  url: string
  protocol?: string
  origin?: string
  headers?: IPureObject
  afterConnection?(connection: WS.connection): void
}

export type WebSocketConnection = Observable<string>
