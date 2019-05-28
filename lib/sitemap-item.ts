import ut = require('./utils')
import fs = require('fs')
import { ChangeFreqInvalidError, NoURLError, NoURLProtocolError, PriorityInvalidError, InvalidVideoDuration, InvalidAttr, InvalidAttrValue, InvalidNewsAccessValue, InvalidNewsFormat, InvalidVideoDescription, InvalidVideoFormat, UndefinedTargetFolder } from './errors'
import builder = require('xmlbuilder')
import isArray = require('lodash/isArray')
import { XMLElementOrXMLNode } from 'xmlbuilder';
import { CHANGEFREQ, EnumAllowDeny, EnumChangefreq, EnumYesNo } from './types';

export type ICallback<E extends Error, T> = (err: E, data?: T) => void;

export interface INewsItem {
	publication: {
		name: string,
		language: string
	},
	genres: string,
	publication_date: string,
	title: string,
	keywords: string,
	stock_tickers: string
}

export interface ISitemapImg {
	url: string,
	caption: string,
	title: string,
	geoLocation: string,
	license: string,
	length?: never,
}

export interface IVideoItem {
	thumbnail_loc: string;
	title: string;
	description: string;
	content_loc?: string;
	player_loc?: string;
	'player_loc:autoplay'
	duration?: string|number;
	expiration_date?: string;
	rating?: string|number;
	view_count?: string|number;
	publication_date?: string;
	family_friendly?: EnumYesNo;
	tag?: string | string[];
	category?: string;
	restriction?: string;
	'restriction:relationship': string,
	gallery_loc?: any;
	price?: string;
	'price:resolution'?: string;
	'price:currency'?: string;
	'price:type'?: string;
	requires_subscription?: EnumYesNo;
	uploader?: string;
	platform?: string;
	'platform:relationship'?: EnumAllowDeny;
	live?: EnumYesNo;
}

export interface ILinkItem {
	lang: string;
	url: string;
}

export interface SitemapItemOptions {
	safe?: boolean;
	lastmodfile?: any;
	lastmodrealtime?: boolean;
	lastmod?: string;
	lastmodISO?: string;
	changefreq?: EnumChangefreq;
	priority?: number;
	news?: INewsItem;
	img?: Partial<ISitemapImg> | Partial<ISitemapImg>[];
	links?: ILinkItem[];
	expires?: string;
	androidLink?: string;
	mobile?: boolean|string;
	video?: IVideoItem;
	ampLink?: string;
	root?: builder.XMLElementOrXMLNode;
	url?: string;

	cdata?
}

function safeDuration (duration) {
  if (duration < 0 || duration > 28800) {
    throw new InvalidVideoDuration()
  }

  return duration
}

const allowDeny = /^allow|deny$/
const validators = {
  'price:currency': /^[A-Z]{3}$/,
  'price:type': /^rent|purchase|RENT|PURCHASE$/,
  'price:resolution': /^HD|hd|sd|SD$/,
  'platform:relationship': allowDeny,
  'restriction:relationship': allowDeny
}

function attrBuilder (conf, keys) {
  if (typeof keys === 'string') {
    keys = [keys]
  }

  let attrs = keys.reduce((attrs, key) => {
    if (conf[key] !== undefined) {
			let keyAr = key.split(':')
      if (keyAr.length !== 2) {
        throw new InvalidAttr(key)
      }

      if (validators[key] && !validators[key].test(conf[key])) {
        throw new InvalidAttrValue(key, conf[key], validators[key])
      }
      attrs[keyAr[1]] = conf[key]
    }

    return attrs
  }, {})

  return attrs
}

/**
 * Item in sitemap
 */
export class SitemapItem {

	conf: SitemapItemOptions;
	loc: SitemapItemOptions["url"];
	lastmod: SitemapItemOptions["lastmod"];
	changefreq: SitemapItemOptions["changefreq"];
	priority: SitemapItemOptions["priority"];
	news?: SitemapItemOptions["news"];
	img?: SitemapItemOptions["img"];
	links?: SitemapItemOptions["links"];
	expires?: SitemapItemOptions["expires"];
	androidLink?: SitemapItemOptions["androidLink"];
	mobile?: SitemapItemOptions["mobile"];
	video?: SitemapItemOptions["video"];
	ampLink?: SitemapItemOptions["ampLink"];
  root: builder.XMLElementOrXMLNode;
  url: builder.XMLElementOrXMLNode & {
    children?: [],
    attributes?: {}
  };

  constructor (conf: SitemapItemOptions = {}) {
    this.conf = conf
    const isSafeUrl = conf.safe

    if (!conf.url) {
      throw new NoURLError()
    }

    // URL of the page
    this.loc = conf.url

    let dt
    // If given a file to use for last modified date
    if (conf.lastmodfile) {
      // console.log('should read stat from file: ' + conf.lastmodfile);
      let file = conf.lastmodfile

      let stat = fs.statSync(file)

      let mtime = stat.mtime

      dt = new Date(mtime)
      this.lastmod = ut.getTimestampFromDate(dt, conf.lastmodrealtime)

      // The date of last modification (YYYY-MM-DD)
    } else if (conf.lastmod) {
      // append the timezone offset so that dates are treated as local time.
      // Otherwise the Unit tests fail sometimes.
      let timezoneOffset = 'UTC-' + (new Date().getTimezoneOffset() / 60) + '00'
      timezoneOffset = timezoneOffset.replace('--', '-')
      dt = new Date(conf.lastmod + ' ' + timezoneOffset)
      this.lastmod = ut.getTimestampFromDate(dt, conf.lastmodrealtime)
    } else if (conf.lastmodISO) {
      this.lastmod = conf.lastmodISO
    }

    // How frequently the page is likely to change
    // due to this field is optional no default value is set
    // please see: http://www.sitemaps.org/protocol.html
    this.changefreq = conf.changefreq
    if (!isSafeUrl && this.changefreq) {
      if (CHANGEFREQ.indexOf(this.changefreq) === -1) {
        throw new ChangeFreqInvalidError()
      }
    }

    // The priority of this URL relative to other URLs
    // due to this field is optional no default value is set
    // please see: http://www.sitemaps.org/protocol.html
    this.priority = conf.priority
    if (!isSafeUrl && this.priority) {
      if (!(this.priority >= 0.0 && this.priority <= 1.0) || typeof this.priority !== 'number') {
        throw new PriorityInvalidError()
      }
    }

    this.news = conf.news || null
    this.img = conf.img || null
    this.links = conf.links || null
    this.expires = conf.expires || null
    this.androidLink = conf.androidLink || null
    this.mobile = conf.mobile || null
    this.video = conf.video || null
    this.ampLink = conf.ampLink || null
    this.root = conf.root || builder.create('root')
    this.url = this.root.element('url')
  }

  /**
   *  Create sitemap xml
   *  @return {String}
   */
  toXML () {
    return this.toString()
  }

  buildVideoElement (video: IVideoItem) {
    const videoxml = this.url.element('video:video')
    if (typeof (video) !== 'object' || !video.thumbnail_loc || !video.title || !video.description) {
      // has to be an object and include required categories https://developers.google.com/webmasters/videosearch/sitemaps
      throw new InvalidVideoFormat()
    }

    if (video.description.length > 2048) {
      throw new InvalidVideoDescription()
    }

    videoxml.element('video:thumbnail_loc', video.thumbnail_loc)
    videoxml.element('video:title').cdata(video.title)
    videoxml.element('video:description').cdata(video.description)
    if (video.content_loc) {
      videoxml.element('video:content_loc', video.content_loc)
    }
    if (video.player_loc) {
      videoxml.element('video:player_loc', attrBuilder(video, 'player_loc:autoplay'), video.player_loc)
    }
    if (video.duration) {
      videoxml.element('video:duration', safeDuration(video.duration))
    }
    if (video.expiration_date) {
      videoxml.element('video:expiration_date', video.expiration_date)
    }
    if (video.rating) {
      videoxml.element('video:rating', video.rating)
    }
    if (video.view_count) {
      videoxml.element('video:view_count', video.view_count)
    }
    if (video.publication_date) {
      videoxml.element('video:publication_date', video.publication_date)
    }
    if (video.family_friendly) {
      videoxml.element('video:family_friendly', video.family_friendly)
    }
    if (video.tag) {
      if (!isArray(video.tag)) {
        videoxml.element('video:tag', video.tag)
      } else {
        for (const tag of video.tag) {
          videoxml.element('video:tag', tag)
        }
      }
    }
    if (video.category) {
      videoxml.element('video:category', video.category)
    }
    if (video.restriction) {
      videoxml.element(
        'video:restriction',
        attrBuilder(video, 'restriction:relationship'),
        video.restriction
      )
    }
    if (video.gallery_loc) {
      videoxml.element(
        'video:gallery_loc',
        {title: video['gallery_loc:title']},
        video.gallery_loc
      )
    }
    if (video.price) {
      videoxml.element(
        'video:price',
        attrBuilder(video, ['price:resolution', 'price:currency', 'price:type']),
        video.price
      )
    }
    if (video.requires_subscription) {
      videoxml.element('video:requires_subscription', video.requires_subscription)
    }
    if (video.uploader) {
      videoxml.element('video:uploader', video.uploader)
    }
    if (video.platform) {
      videoxml.element(
        'video:platform',
        attrBuilder(video, 'platform:relationship'),
        video.platform
      )
    }
    if (video.live) {
      videoxml.element('video:live', video.live)
    }
  }

  buildXML (): builder.XMLElementOrXMLNode {
    this.url.children = []
    this.url.attributes = {}
    // xml property
    const props = ['loc', 'lastmod', 'changefreq', 'priority', 'img', 'video', 'links', 'expires', 'androidLink', 'mobile', 'news', 'ampLink'] as const;
    // property array size (for loop)
    let ps = 0
    // current property name (for loop)
    let p

    while (ps < props.length) {
      p = props[ps]
      ps++

      if (this[p] && p === 'img') {
        // Image handling
        if (typeof (this[p]) !== 'object' || this[p].length === undefined) {
          // make it an array
          this[p] = [this[p]]
        }
        this[p].forEach(image => {
          const xmlObj = {}
          if (typeof (image) !== 'object') {
            // it’s a string
            // make it an object
            xmlObj['image:loc'] = image
          } else if (image.url) {
            xmlObj['image:loc'] = image.url
          }
          if (image.caption) {
            xmlObj['image:caption'] = {'#cdata': image.caption}
          }
          if (image.geoLocation) {
            xmlObj['image:geo_location'] = image.geoLocation
          }
          if (image.title) {
            xmlObj['image:title'] = {'#cdata': image.title}
          }
          if (image.license) {
            xmlObj['image:license'] = image.license
          }

          this.url.element({'image:image': xmlObj})
        })
      } else if (this[p] && p === 'video') {
        // Image handling
        if (typeof (this[p]) !== 'object' || this[p].length === undefined) {
          // make it an array
          this[p] = [this[p]]
        }
        this[p].forEach(this.buildVideoElement, this)
      } else if (this[p] && p === 'links') {
        this[p].forEach(link => {
          this.url.element({'xhtml:link': {
            '@rel': 'alternate',
            '@hreflang': link.lang,
            '@href': link.url
          }})
        })
      } else if (this[p] && p === 'expires') {
        this.url.element('expires', new Date(this[p]).toISOString())
      } else if (this[p] && p === 'androidLink') {
        this.url.element('xhtml:link', {rel: 'alternate', href: this[p]})
      } else if (this[p] && p === 'mobile') {
        const mobileitem = this.url.element('mobile:mobile')
        if (typeof this[p] === 'string') {
          mobileitem.att('type', this[p])
        }
      } else if (p === 'priority' && (this[p] >= 0.0 && this[p] <= 1.0)) {
        this.url.element(p, parseFloat(this[p]).toFixed(1))
      } else if (this[p] && p === 'ampLink') {
        this.url.element('xhtml:link', { rel: 'amphtml', href: this[p] })
      } else if (this[p] && p === 'news') {
        let newsitem = this.url.element('news:news')

        if (!this[p].publication ||
            !this[p].publication.name ||
            !this[p].publication.language ||
            !this[p].publication_date ||
            !this[p].title
        ) {
          throw new InvalidNewsFormat()
        }

        if (this[p].publication) {
          let publication = newsitem.element('news:publication')
          if (this[p].publication.name) {
            publication.element('news:name').cdata(this[p].publication.name)
          }
          if (this[p].publication.language) {
            publication.element('news:language', this[p].publication.language)
          }
        }

        if (this[p].access) {
          if (
            this[p].access !== 'Registration' &&
            this[p].access !== 'Subscription'
          ) {
            throw new InvalidNewsAccessValue()
          }
          newsitem.element('news:access', this[p].access)
        }

        if (this[p].genres) {
          newsitem.element('news:genres', this[p].genres)
        }

        newsitem.element('news:publication_date', this[p].publication_date)
        newsitem.element('news:title').cdata(this[p].title)

        if (this[p].keywords) {
          newsitem.element('news:keywords', this[p].keywords)
        }

        if (this[p].stock_tickers) {
          newsitem.element('news:stock_tickers', this[p].stock_tickers)
        }
      } else if (this[p]) {
        if (p === 'loc' && this.conf.cdata) {
          this.url.element({
            [p]: {
              '#raw': this[p]
            }
          })
        } else {
          this.url.element(p, this[p])
        }
      }
    }

    return this.url
  }

  /**
   *  Alias for toXML()
   *  @return {String}
   */
  toString (): string {
    return this.buildXML().toString()
  }
}

export default SitemapItem
