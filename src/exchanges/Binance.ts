import ccxt from 'ccxt'
import { chain, map } from 'lodash'
import { BaseExchange } from './BaseExchange'
import { Market } from '../Market'
import { createHmac } from 'crypto'
import qs from 'query-string'
import rp from 'request-promise'
import {
  IOrderbook,
  IOrderParams,
  IOrderResult,
  ICancelOrderResult,
  IOrderStatus,
  OrderSide,
  ExchangeName,
  IMyBalance,
  OrderType,
  IWithdrawParams,
  ITransactionResult
} from '../types/general'

import { ITransaction, IBinanceMarginResult, IBinanceMarginAsset, MarginTransferType } from '../types/binance'

export class Binance extends BaseExchange {
  public BNB_REQUIRED_QUANTITY: number
  public ID: string
  public ENDPOINT: string
  public NAME: ExchangeName
  protected ccxt: ccxt.binance
  private API_KEY: string
  private SECRET: string

  constructor(ID: string, API_KEY: string, SECRET: string, FILLUP_EXCHANGE_VOLUME?: number) {
    super()
    this.ccxt = new ccxt.binance({ apiKey: API_KEY, secret: SECRET })
    this.NAME = ExchangeName.Binance
    this.ID = ID
    this.ENDPOINT = 'https://api.binance.com/'
    this.API_KEY = API_KEY
    this.SECRET = SECRET
    this.BNB_REQUIRED_QUANTITY = FILLUP_EXCHANGE_VOLUME ? 1 : FILLUP_EXCHANGE_VOLUME
  }

  //public api
  public loadMarkets(): Promise<void> {
    return this.ccxt.loadMarkets().then(ccxtRawMarkets => {
      const marketArray: Market[] = map(ccxtRawMarkets, (marketData: ccxt.Market, marketString: string) => {
        const { baseUnit, quoteUnit } = Market.getBaseQuoteUnit(marketString)

        return new Market(baseUnit, quoteUnit, {
          MINIMUM_AMOUNT: marketData.limits.cost.min,
          VOLUME_DIGITS: marketData.precision.amount,
          PRICE_UNIT: 1 / 10 ** marketData.precision.price
        })
      })
      this.markets = Market.marketArrayToDict(marketArray)
    })
  }

  public getOrderbookFromMarket(marketString: string, length = 10): Promise<IOrderbook> {
    return this.ccxt.fetchOrderBook(this.buildCcxtMarketSymbol(marketString), length).then(body => {
      return {
        exchangeName: this.NAME,
        marketString: marketString,
        timestamp: new Date(),
        asks: this.parseOrdersData(body.asks, length),
        bids: this.parseOrdersData(body.bids, length)
      }
    })
  }

  //private api
  public getMyBalance(): Promise<IMyBalance> {
    return this.ccxt.fetchBalance().then(data => {
      return chain(data)
        .mapKeys((_: ccxt.Balance, key: string) => key.toLowerCase())
        .mapValues((value: ccxt.Balance) => ({
          available: value.free,
          balance: value.total
        }))
        .value()
    })
  }

  public async placeOrder(orderParams: IOrderParams): Promise<IOrderResult> {
    await this.fillUpBNB()
    const { price, volume } = this.preprocessPriceVolume(orderParams)

    try {
      switch (orderParams.orderType) {
        case OrderType.Limit:
          const limitResult = await this.ccxt.createOrder(
            this.buildCcxtMarketSymbol(orderParams.marketString),
            'limit',
            orderParams.side,
            volume,
            price
          )
          return Promise.resolve({
            orderId: limitResult.id,
            marketString: orderParams.marketString,
            price,
            volume
          })
        case OrderType.Market:
          const marketResult = await this.ccxt.createOrder(
            this.buildCcxtMarketSymbol(orderParams.marketString),
            'market',
            orderParams.side,
            volume
          )
          return Promise.resolve({
            orderId: marketResult.id,
            marketString: orderParams.marketString,
            price,
            volume
          })
      }
    } catch (error) {
      error.message = `CCXT ${this.NAME} LIMIT ORDER ERROR: ${orderParams.marketString} ${orderParams.side} ${orderParams.price} ${orderParams.volume} ${error.message}`
      throw error
    }
  }

  public withdraw(params: IWithdrawParams): Promise<ITransactionResult> {
    if (!this.ccxt.has.withdraw) {
      throw 'ERROR DONT HAVE WITHDRAW API'
    }

    return this.ccxt
      .withdraw(
        params.currency.toUpperCase(),
        params.amount,
        params.toAddress.address,
        params.toAddress.optionalAddress || undefined
      )
      .then((result: ccxt.WithdrawalResponse) => {
        if (!result) {
          throw 'CCXT WITHDRAWAL FAILED'
        }

        return {
          currency: params.currency,
          fromAddress: {
            address: null,
            exchange: this.NAME
          },
          toAddress: params.toAddress,
          amount: params.amount,
          timestamp: new Date()
        }
      })
  }

  public getDepositHistory(currency: string, limit: number): Promise<ITransactionResult[]> {
    return this.ccxt
      .fetchDeposits(currency.toUpperCase(), undefined, limit)
      .then((transactions: ccxt.Transaction[]) => {
        return transactions
          .filter((t: ccxt.Transaction) => t.status === 'ok')
          .map((t: ccxt.Transaction) => ({
            currency,
            fromAddress: null,
            toAddress: {
              currency,
              exchangeName: this.NAME,
              address: t.address,
              optionalAddress: t.txid ? t.txid : null
            },
            amount: t.amount,
            fee: t.fee.cost ? t.fee.cost : 0,
            txid: t.txid,
            timestamp: new Date(t.timestamp)
          }))
      })
  }
  public getWithdrawalHistory(currency: string, since: number, limit = 10): Promise<ITransactionResult[]> {
    return this.ccxt.fetchWithdrawals(currency.toUpperCase(), since, limit).then((transactions: ITransaction[]) => {
      return transactions
        .filter((t: ITransaction) => t.status === 'ok')
        .map((t: ITransaction) => {
          return {
            currency,
            fromAddress: {
              address: null,
              exchange: this.NAME
            },
            toAddress: {
              currency,
              address: t.address,
              optionalAddress: t.tag
            },
            amount: t.amount,
            fee: t.fee.cost,
            txid: t.txid,
            timestamp: new Date(t.timestamp)
          }
        })
    })
  }

  public cancelOrder(orderId: string | number, marketString: string): Promise<ICancelOrderResult> {
    return this.ccxt.cancelOrder(`${orderId}`, this.buildCcxtMarketSymbol(marketString)).then(() => {
      return {
        success: true
      }
    })
  }

  public getOpenOrders(marketString: string): Promise<IOrderStatus[]> {
    return this.ccxt.fetchOpenOrders(this.buildCcxtMarketSymbol(marketString)).then(body => {
      return body.map((order: ccxt.Order) => {
        return {
          orderId: order.id,
          orderStatus: 'Open',
          side: <OrderSide>order.side,
          price: order.price,
          volume: order.amount,
          remainingVolume: order.remaining
        }
      })
    })
  }

  //optional
  private parseOrdersData(orders: ccxt.OrderBook['asks'], limit: number = 30) {
    return orders.slice(0, limit).map((o: [number, number]) => ({
      p: o[0],
      v: o[1]
    }))
  }
  private buildCcxtMarketSymbol(marketString: string) {
    const market = this.markets[marketString]

    return `${market.baseUnit.toUpperCase()}/${market.quoteUnit.toUpperCase()}`
  }

  private async fillUpBNB() {
    const marketString = `bnb/usdt`
    const [balance, quoteMarketOrderbook] = await Promise.all([
      this.getMyBalance(),
      this.getOrderbookFromMarket(marketString)
    ])
    const fillupBNBVolume = this.BNB_REQUIRED_QUANTITY - balance['bnb'].balance //BNB

    if (balance['bnb'].balance <= this.BNB_REQUIRED_QUANTITY / 2) {
      if (balance['usdt'].balance > fillupBNBVolume * quoteMarketOrderbook.asks[0].p) {
        const response = await this.ccxt.createOrder(
          this.buildCcxtMarketSymbol(marketString),
          'limit',
          OrderSide.Buy,
          fillupBNBVolume,
          quoteMarketOrderbook.asks[0].p
        )
        console.log(
          `FILL UP BNB \nMARKET : ${marketString} PRICE : ${response.price} VOLUME : ${fillupBNBVolume} FILLED : ${response.filled}`
        )

        try {
          console.log(await this.cancelOrder(response.id, marketString))
        } catch {
          console.log(`DONT HAVE ${response.id} ORDER `)
        }
      } else {
        console.log(`BINANCE DON'T HAVE USDT BALANCE`)
      }
    }
  }
  /**
   * Converts marketString format from ours to binance's or vice versa.
   * @tutorial default: ours => binance market string
   * @tutorial inverse: binance market string => ours
   * @param  {string} marketString
   * @param  {boolean} inverse?
   */

  //Margin
  public marginAccountTransfer(asset: string, amount: number, type: MarginTransferType): Promise<IBinanceMarginResult> {
    const params: {
      asset: string
      amount: number
      type: number
      recvWindow?: number
      timestamp: number
    } = {
      asset: asset.toUpperCase(),
      amount,
      type,
      timestamp: Date.now()
    }
    return this.privateRequestApi(params, 'sapi/v1/margin/transfer', 'POST')
      .then(response => {
        if (!isNaN(response.tranId)) {
          return { success: true }
        } else {
          return { success: false }
        }
      })
      .catch(error => {
        error.message = `marginAccountTransfer ERROR: ${asset} ${amount} ${type} ${error.message}`
        throw error
      })
  }

  public marginAccountBorrow(asset: string, amount: number): Promise<IBinanceMarginResult> {
    const params: {
      asset: string
      amount: number
      recvWindow?: number
      timestamp: number
    } = {
      asset: asset.toUpperCase(),
      amount,
      timestamp: Date.now()
    }
    return this.privateRequestApi(params, 'sapi/v1/margin/loan', 'POST')
      .then(response => {
        if (!isNaN(response.tranId)) {
          return { success: true }
        } else {
          return { success: false }
        }
      })
      .catch(error => {
        error.message = `marginAccountBorrow ERROR: ${asset} ${amount} ${error.message}`
        throw error
      })
  }

  public marginAccountRepay(asset: string, amount: number): Promise<IBinanceMarginResult> {
    const params: {
      asset: string
      amount: number
      recvWindow?: number
      timestamp: number
    } = {
      asset,
      amount,
      timestamp: Date.now()
    }
    return this.privateRequestApi(params, 'sapi/v1/margin/repay', 'POST')
      .then(response => {
        if (!isNaN(response.tranId)) {
          return { success: true }
        } else {
          return { success: false }
        }
      })
      .catch(error => {
        error.message = `marginAccountRepay ERROR: ${asset} ${amount} ${error.message}`
        throw error
      })
  }

  public getMarginAccountDetails(): Promise<IBinanceMarginAsset> {
    const params: {
      recvWindow?: number
      timestamp: number
    } = {
      timestamp: Date.now()
    }
    return this.privateRequestApi(params, 'sapi/v1/margin/account', 'GET').then(response => {
      const dictionary: {
        [asset: string]: {
          borrowed: number
          free: number
          netAsset: number
          leverage: number
        }
      } = {}
      response.userAssets.forEach(
        (marginAssetInfo: {
          asset: string
          borrowed: string
          free: string
          interest: string
          locked: string
          netAsset: string
        }) => {
          const currency: string = marginAssetInfo.asset
          dictionary[currency] = {
            borrowed: parseInt(marginAssetInfo.borrowed),
            free: parseInt(marginAssetInfo.free),
            netAsset: parseInt(marginAssetInfo.netAsset),
            leverage:
              parseInt(marginAssetInfo.borrowed) === 0
                ? 0
                : parseInt(marginAssetInfo.borrowed) / parseInt(marginAssetInfo.netAsset)
          }
        }
      )
      return dictionary
    })
  }

  private privateRequestApi(params: any, path: string, method: string) {
    const paramString = qs.stringify(params)
    params.signature = createHmac('SHA256', this.SECRET)
      .update(paramString)
      .digest('hex')
    const query = '?' + paramString + '&signature=' + params.signature
    const url = this.ENDPOINT + path + query
    const headers = {
      'X-MBX-APIKEY': this.API_KEY
    }
    const timeout = 3000
    const options = { url, headers, timeout, method }

    return rp(options).then((message: string) => JSON.parse(message))
  }
}
