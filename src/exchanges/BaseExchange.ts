import {
  IOrderbook,
  IMyBalance,
  IOrderResult,
  ICancelOrderResult,
  IOrderParams,
  IOrderStatus,
  IMyPosition,
  IWithdrawParams,
  ITransactionResult,
  ExchangeName
} from '../types/general'

import { floor, cloneDeep } from 'lodash'
import { IMarketDict } from '../Market'

export abstract class BaseExchange {
  public NAME: ExchangeName
  public DEPOSIT: { ADDRESS: string; OPTIONAL_ADDRESS?: string } = { ADDRESS: null }
  protected markets: IMarketDict = {}
  /**
   * [Market-related methods]
   *
   * Loads and Maintains markets inside the exchange.
   * This method must be called before using other methods.
   */
  public abstract loadMarkets(): Promise<void>

  /**
   * [Market-related methods]
   *
   * Returns an instance containing all markets of this exchange.
   * @returns IMarketDict
   */
  public getMarkets() {
    return cloneDeep(this.markets)
  }

  /**
   * [Public Request API]
   *
   * Returns the return value of getMinimumVolume() of the given market.
   * @param  {string} marketString
   * @param  {number} price
   * @returns number
   */
  public getMinimumVolume(marketString: string, price: number): number {
    const market = this.markets[marketString]
    return market.options.MINIMUM_VOLUME ? market.options.MINIMUM_VOLUME : market.options.MINIMUM_AMOUNT / price
  }
  /**
   * [Public Request API]
   *
   * Returns the return value of getMinimumAmount() of the given market.
   * @param  {string} marketString
   * @param  {number} price
   * @returns number
   */

  public getMinimumAmount(marketString: string, price: number): number {
    const market = this.markets[marketString]

    return market.options.MINIMUM_AMOUNT ? market.options.MINIMUM_AMOUNT : market.options.MINIMUM_VOLUME * price
  }

  /**
   * [Public Request API]
   *
   * Returns an orderbook data of the given market.
   * @param  {string} marketString
   * @param  {number} length? - depth of the orderbook
   * @returns Promise<IOrderbook>
   */
  public abstract getOrderbookFromMarket(marketString: string): Promise<IOrderbook>
  /**
   * [Private Request API]
   *
   * Returns the balance of the specified currencies of the account.
   * If you don't specify any currency, it returns the balance of every currency supported in the exchange.
   * @param  {string} makretString?
   * @returns Promise<IMyBalance>
   */
  public abstract getMyBalance(marketString?: string): Promise<IMyBalance>
  /**
   * [Private Request API]
   *
   * Returns the position of the specified symbol of the account.
   * The basic structure is the Spot Market.
   * @param  {string} marketString?
   * @returns Promise<IMyPosition>
   */
  public getMyPosition(marketString?: string): Promise<IMyPosition> {
    throw new Error(`Exchange is a Spot Exchange ${marketString}`)
  }
  /**
   * [Private Request API]
   *
   * Create a place order to the exchange.
   * @param  {IOrderParams} orderParams
   * @returns Promise<IOrderResult>
   */
  public abstract placeOrder(orderParams: IOrderParams): Promise<IOrderResult>
  /**
   * [Private Request API]
   *
   * @param {string} currency
   * @param {number} limit
   */
  public getDepositHistory(currency: string, since?: number, limit?: number): Promise<ITransactionResult[]> {
    throw `DONT HAVE DEPOSIT HISTORY API ${currency} ${since} ${limit}`
  }
  /**
   * [Private Request API]
   *
   * @param {string} currency
   * @param {number} since
   * @param {number} limit
   */
  public getWithdrawalHistory(currency: string, since?: number, limit?: number): Promise<ITransactionResult[]> {
    throw `DONT HAVE WITHDRAWAL HISTORY API ${currency} ${since} ${limit}`
  }

  public getTradeHistory(marketString?: string, startTime?: number, orderId?: string): Promise<IOrderStatus[]> {
    throw `DONT HAVE TRADE HISOTRY API ${marketString} ${startTime} ${orderId}`
  }

  public getMyLeverage(marketString: string) {
    throw `DONT HAVE API ${marketString}`
  }
  /**
   * [Private Request API]
   *
   * Specifies an order with the orderId, and cancels the order.
   * @tutorial  Be careful: some exchanges will require us to set marketString when canceling an order.
   * @param  {string|number} orderId
   * @param  {string} marketString?
   * @returns Promise<ICancelOrderResult>
   */
  public abstract cancelOrder(marketString?: string, orderId?: string | number): Promise<ICancelOrderResult>
  /**
   * [Private Request API]
   *
   * @param  {string} marketString?
   * @returns Promise<ICancelOrderResult[]>
   */
  public cancelAllOrders(marketString?: string): Promise<ICancelOrderResult[]> {
    throw new Error(`NOT IMPLEMENT ${marketString}`)
  }
  /**
   * [Private Request API]
   *
   * @param {IWithdrawParams} params
   * @returns Promise<ITransactionResult>
   */
  public withdraw(params: IWithdrawParams): Promise<ITransactionResult> {
    throw new Error(`DONT HAVE WITHDRAW API ${params}`)
  }
  /**
   * [Private Request API]
   *
   * Returns open orders to be filled.
   * @param  {string} marketString?
   * @returns Promise <>
   */
  public abstract getOpenOrders(marketString?: string, orderId?: string): Promise<IOrderStatus[]>
  /**
   * [Common Utility Method]
   *
   * Returns a price unit of the market
   * @param  {string} marketString
   * @param  {number} _price
   * price of the coin, for the exchanges with dynamic price unit. (Upbit, Bithumb, etc.)
   * @returns number
   */
  public getPriceUnit(marketString: string, _price?: number): number {
    return this.markets[marketString].options.PRICE_UNIT
  }

  /**
   * [Utility Function]
   *
   * Preprocess the price and volume inside the `orderParams` to make `limitOrder()` successful.
   * @param  {IOrderParams} orderParams
   */
  protected preprocessPriceVolume(orderParams: IOrderParams) {
    const { marketString, price, volume } = orderParams
    const priceUnit = this.getPriceUnit(marketString, price)
    const volumeDigits = this.markets[marketString].options.VOLUME_DIGITS

    return {
      price: floor(price, priceUnit.toString().length),
      volume: floor(volume, volumeDigits)
    }
  }

  //   protected applyPriceUnit(price: number, side: OrderSide, priceUnit: number): number {
  //     // ref: isNumber(NaN) = true
  //     if (!isNumber(priceUnit) || isNaN(priceUnit)) {
  //       return price
  //     }

  //     if (priceUnit >= 1) {
  //       return price % priceUnit === 0
  //         ? price
  //         : OrderSide.Buy === side
  //         ? price + (priceUnit - (price % priceUnit))
  //         : price - (price % priceUnit)
  //     } else {
  //       return this.applyPriceUnit(price * Math.pow(10, 8), side, priceUnit * Math.pow(10, 8)) / Math.pow(10, 8)
  //     }
  //   }
}
