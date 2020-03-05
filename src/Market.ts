import { chain } from 'lodash'

export class Market {
  public baseUnit: string
  public quoteUnit: string
  public options: {
    MINIMUM_VOLUME?: number
    MINIMUM_AMOUNT?: number
    VOLUME_DIGITS?: number
    PRICE_UNIT?: number
    LEVERAGE?: {
      MIN: number
      MAX: number
      STEP_SIZE: number
    }
  } = {}

  constructor(baseUnit: string, quoteUnit: string, options = {}) {
    this.baseUnit = baseUnit
    this.quoteUnit = quoteUnit
    this.options = { ...options }
  }
  public static buildString(baseUnit: string, quoteUnit: string): string {
    return `${baseUnit}/${quoteUnit}`
  }
  public static getBaseQuoteUnit(marketString: string) {
    const splitted = marketString.toLowerCase().split('/')

    return {
      baseUnit: <string>splitted[0],
      quoteUnit: <string>splitted[1]
    }
  }

  public static marketArrayToDict(markets: Market[]): { [marketString: string]: Market } {
    return chain(markets)
      .map((market: Market) => [market.toString(), market])
      .fromPairs()
      .value()
  }

  public toString() {
    return Market.buildString(this.baseUnit, this.quoteUnit)
  }
  public getMinimumVolume(price: number) {
    return this.options.MINIMUM_VOLUME ? this.options.MINIMUM_VOLUME : this.options.MINIMUM_AMOUNT / price
  }
  public getMinimumAmount(price: number) {
    return this.options.MINIMUM_AMOUNT ? this.options.MINIMUM_AMOUNT : this.options.MINIMUM_VOLUME * price
  }
}
export interface IMarketDict {
  [marketString: string]: Market
}
