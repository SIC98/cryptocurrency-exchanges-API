import ccxt from 'ccxt'
import { BaseExchange } from './BaseExchange'
import { Market } from '../Market'
import { map } from 'lodash'
import {
  IOrderbook,
  IMyBalance,
  ICancelOrderResult,
  ExchangeName,
  OrderType,
  IOrderParams,
  IOrderResult,
  OrderSide,
  IOrderStatus,
  IMyPosition,
  MarginType
} from '../types/general'
import { IBitmexPositionMessage, IBitmexPosition } from '../types/bitmex'

export class Bitmex extends BaseExchange {
  public ID: string
  public NAME: ExchangeName
  protected ccxt: ccxt.bitmex

  constructor(ID: string, API_KEY: string, SECRET: string) {
    super()
    this.ccxt = new ccxt.bitmex({ apiKey: API_KEY, secret: SECRET })
    this.ID = ID
    this.NAME = ExchangeName.Bitmex
  }

  public async loadMarkets(): Promise<void> {
    const ccxtRawMarkets = await this.ccxt.loadMarkets()
    const keys = Object.keys(ccxtRawMarkets)
    const matchingKeys = keys.filter(key => {
      return key[0] !== '.'
    })

    let ccxtTradableMarkets: { [key: string]: Object } = {}
    matchingKeys.forEach(key => (ccxtTradableMarkets[key] = ccxtRawMarkets[key]))
    const marketArray: Market[] = map(ccxtTradableMarkets, (marketData: ccxt.Market, marketString: string) => {
      const { baseUnit, quoteUnit } = marketString.includes('20')
        ? { baseUnit: marketString.toLowerCase().slice(0, 3), quoteUnit: marketString.toLowerCase().slice(3) }
        : Market.getBaseQuoteUnit(marketString)

      return new Market(baseUnit, quoteUnit, {
        MINIMUM_AMOUNT: marketData.limits.amount.min ? marketData.limits.amount.min : marketData.limits.cost.min,
        VOLUME_DIGITS: marketData.precision.amount,
        PRICE_UNIT: marketData.precision.price
      })
    })
    this.markets = Market.marketArrayToDict(marketArray)
  }

  public getMyPosition(marketString: string): Promise<IMyPosition> {
    return this.ccxt
      .privateGetPosition()
      .then((message: IBitmexPositionMessage) =>
        message.find(p => p.symbol === this.toTheirsMarketParser(marketString))
      )
      .then((data: IBitmexPosition) => {
        return {
          symbol: data.symbol,
          entryPrice: data.avgEntryPrice,
          marginType: data.crossMargin ? MarginType.CrossMargin : MarginType.IsolatedMargin,
          leverage: data.leverage,
          liquidationPrice: data.liquidationPrice,
          unrealizedPnl: data.unrealisedPnl,
          baseSize: data.currentQty
        }
      })
  }

  public async getOrderbookFromMarket(marketString: string, length = 10): Promise<IOrderbook> {
    const body = await this.ccxt.fetchOrderBook(this.buildCcxtMarketSymbol(marketString), length)

    return {
      exchangeName: this.NAME,
      marketString: marketString,
      timestamp: new Date(),
      asks: this.parseOrdersData(body.asks, length),
      bids: this.parseOrdersData(body.bids, length)
    }
  }

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

  public async cancelOrder(orderId: string, marketString: string): Promise<ICancelOrderResult> {
    await this.ccxt.cancelOrder(orderId, this.buildCcxtMarketSymbol(marketString))
    return {
      success: true
    }
  }

  public async placeOrder(orderParams: IOrderParams): Promise<IOrderResult> {
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
          return Promise.resolve({ orderId: limitResult.id, marketString: orderParams.marketString, price, volume })
        case OrderType.Market:
          const marketResult = await this.ccxt.createOrder(
            this.buildCcxtMarketSymbol(orderParams.marketString),
            'market',
            orderParams.side,
            volume
          )
          return Promise.resolve({ orderId: marketResult.id, marketString: orderParams.marketString, price, volume })
      }
    } catch (error) {
      error.message = `CCXT ${this.NAME} LIMIT ORDER ERROR: ${orderParams.marketString} ${orderParams.side} ${orderParams.price} ${orderParams.volume} ${error.message}`
      throw error
    }
  }
  //private api
  public getMyBalance(): Promise<IMyBalance> {
    return this.ccxt.fetchBalance().then(data => {
      return { btc: { balance: data.BTC.total, available: data.BTC.free } }
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
  //Optional Function
  private toTheirsMarketParser(marketString: string) {
    const { baseUnit, quoteUnit } = Market.getBaseQuoteUnit(marketString)
    if (baseUnit === 'btc') {
      return `XBT${quoteUnit.toUpperCase()}`
    }
    return `${baseUnit.toUpperCase()}${quoteUnit.toUpperCase()}`
  }
}
