import rp from 'request-promise'
import qs from 'query-string'
import { createHmac } from 'crypto'
import { BaseExchange } from './BaseExchange'
import { Market } from '../Market'
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
  IMyPosition,
  MarginType
} from '../types/general'
import { IBinanceFuturesBalance, IBinanceFuturesOpenOrder } from '../types/binanceFutures'

export class BinanceFutures extends BaseExchange {
  public BNB_REQUIRED_QUANTITY: number
  public ID: string
  private ENDPOINT: string
  private API_KEY: string
  private SECRET: string
  constructor(ID: string, API_KEY: string, SECRET: string) {
    // FILLUP_EXCHANGE_VOLUME?: number
    super()
    this.API_KEY = API_KEY
    this.SECRET = SECRET
    this.ENDPOINT = 'https://fapi.binance.com/'
    this.NAME = ExchangeName.BinanceFutures
    this.ID = ID
  }

  //public api
  public loadMarkets(): Promise<void> {
    return this.privateRequestApi({}, 'fapi/v1/exchangeInfo', 'GET').then(response => {
      const marketArray = response.symbols.map(
        (market: {
          symbol: string
          status: string
          aintMarginPercent: string
          requiredMarginPercent: string
          baseAsset: string
          quoteAsset: string
          pricePrecision: number
          quantityPrecision: number
          baseAssetPrecision: number
          quotePrecision: number
          filters: {
            filterType: string
            maxPrice?: string
            minPrice?: string
            tickSize?: string
            limit?: number
            stepSize?: string
            maxQty?: number
            minQty?: number
          }[]
          orderTypes: string[]
          timeInForce: string[]
        }) => {
          const baseUnit = market.baseAsset.toLowerCase()
          const quoteUnit = market.quoteAsset.toLowerCase()
          const LOT_SIZE = market.filters.find(marketInfo => marketInfo.filterType === 'LOT_SIZE')
          const PRICE_FILTER = market.filters.find(marketInfo => marketInfo.filterType === 'PRICE_FILTER')
          return new Market(baseUnit, quoteUnit, {
            PRICE_UNIT: Number(PRICE_FILTER.tickSize),
            MINIMUM_VOLUME: Number(LOT_SIZE.minQty),
            VOLUME_DIGITS: -Math.log10(Number(LOT_SIZE.stepSize))
          })
        }
      )
      this.markets = Market.marketArrayToDict(marketArray)
    })
  }

  public getOrderbookFromMarket(marketString: string, length = 10): Promise<IOrderbook> {
    return this.privateRequestApi(
      {
        symbol: this.toTheirsMarketParser(marketString),
        limit: length
      },
      'fapi/v1/depth',
      'GET'
    ).then(response => {
      return {
        exchangeName: this.NAME,
        marketString: marketString,
        timestamp: new Date(),
        asks: response.asks.map((orderbook: [string, string]) => ({
          p: parseFloat(orderbook[0]),
          v: parseFloat(orderbook[1])
        })),
        bids: response.bids.map((orderbook: [string, string]) => ({
          p: parseFloat(orderbook[0]),
          v: parseFloat(orderbook[1])
        }))
      }
    })
  }

  //private api
  public getMyBalance(): Promise<IMyBalance> {
    const dictionary: { [marketString: string]: { balance: number; available?: number } } = {}

    const params: {
      timestamp: number
      recvWindow?: number
      signature?: string
    } = {
      timestamp: Date.now()
    }

    return this.privateRequestApi(params, 'fapi/v1/balance', 'GET').then(response => {
      response.map((balanceInfo: IBinanceFuturesBalance) => {
        const baseUnit: string = balanceInfo.asset
        dictionary[baseUnit] = {
          balance: parseFloat(balanceInfo.balance),
          available: parseFloat(balanceInfo.withdrawAvailable)
        }
      })
      return dictionary
    })
  }

  public async placeOrder(orderParams: IOrderParams): Promise<IOrderResult> {
    const { price, volume } = this.preprocessPriceVolume(orderParams)

    const params: {
      symbol: string
      side: string
      type: string
      timeInForce?: string
      quantity: number
      readonly?: boolean
      price?: number
      newClientOrderId?: string
      stopPrice?: number
      workingType?: string
      recvWindow?: number
      timestamp: number
      signature?: string
    } = {
      symbol: this.toTheirsMarketParser(orderParams.marketString),
      side: orderParams.side.toUpperCase(),
      type: orderParams.orderType.toString().toUpperCase(),
      quantity: volume,
      timestamp: Date.now()
    }

    try {
      if (orderParams.orderType === OrderType.Market) {
        params.price = orderParams.price
      }
      const response = await this.privateRequestApi(params, 'fapi/v1/order', 'POST')
      return Promise.resolve({ orderId: response.orderId, marketString: response.symbol, price, volume })
    } catch (error) {
      error.message = `${this.NAME} LIMIT ORDER ERROR: ${orderParams.marketString} ${orderParams.side} ${orderParams.price} ${orderParams.volume} ${error.message}`
      throw error
    }
  }

  public cancelOrder(orderId: string | number, marketString: string): Promise<ICancelOrderResult> {
    const params: {
      symbol: string
      orderId?: string | number
      origClientOrderId?: string
      recvWindow?: number
      timestamp: number
    } = {
      symbol: this.toTheirsMarketParser(marketString),
      orderId: orderId,
      timestamp: Date.now()
    }

    return this.privateRequestApi(params, 'fapi/v1/order', 'DELETE').then(response => {
      if (!isNaN(response.orderId)) {
        return {
          success: true
        }
      } else {
        return {
          success: false
        }
      }
    })
  }

  public async cancelAllOrders(marketString: string): Promise<ICancelOrderResult[]> {
    const params: {
      symbol: string
      recvWindow?: number
      timestamp: number
    } = {
      symbol: this.toTheirsMarketParser(marketString),
      timestamp: Date.now()
    }

    try {
      const openOrderLen: number = (await this.getOpenOrders(marketString)).length
      const response = await this.privateRequestApi(params, 'fapi/v1/allOpenOrders', 'DELETE')
      if (response.code === 200) {
        // tslint:disable-next-line: prefer-array-literal
        return Array(openOrderLen).fill({ success: true })
      } else {
        // tslint:disable-next-line: prefer-array-literal
        return Array(openOrderLen).fill({ success: false })
      }
    } catch (error) {
      throw error
    }
  }

  public getOpenOrders(marketString: string): Promise<IOrderStatus[]> {
    const params: {
      symbol: string
      recvWindow?: number
      timestamp: number
    } = {
      symbol: this.toTheirsMarketParser(marketString),
      timestamp: Date.now()
    }

    return this.privateRequestApi(params, 'fapi/v1/openOrders', 'GET').then(response => {
      return response.map((order: IBinanceFuturesOpenOrder) => {
        return {
          orderId: order.orderId,
          orderStatus: order.status,
          side: <OrderSide>order.side,
          price: order.price,
          volume: order.origQty,
          remainingVolume: parseFloat(order.origQty) - parseFloat(order.executedQty)
        }
      })
    })
  }

  public getMyPosition(marketString: string): Promise<IMyPosition> {
    const params: {
      recvWindow?: number
      timestamp: number
    } = {
      timestamp: Date.now()
    }

    return this.privateRequestApi(params, 'fapi/v1/positionRisk', 'GET').then(response => {
      const marketPosition = response.find(
        (position: {
          entryPrice: string
          marginType: string
          isAutoAddMargin: string
          isolatedMargin: string
          leverage: string
          liquidationPrice: string
          markPrice: string
          maxNotionalValue: string
          positionAmt: string
          symbol: string
          unRealizedProfit: string
        }) => position.symbol === this.toTheirsMarketParser(marketString)
      )

      return {
        symbol: marketPosition.symbol,
        baseSize: marketPosition.positionAmt,
        unrealizedPnl: marketPosition.unRealizedProfit,
        entryPrice: marketPosition.entryPrice,
        marginType: marketPosition.marginType === 'cross' ? MarginType.CrossMargin : MarginType.IsolatedMargin,
        leverage: marketPosition.leverage,
        liquidationPrice: marketPosition.liquidationPrice
      }
    })
  }

  //Optional Function
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

  private toTheirsMarketParser(marketSring: string) {
    const { baseUnit, quoteUnit } = Market.getBaseQuoteUnit(marketSring)
    return `${baseUnit.toUpperCase()}${quoteUnit.toUpperCase()}`
  }
}
