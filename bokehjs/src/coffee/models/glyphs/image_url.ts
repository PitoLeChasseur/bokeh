/* XXX: partial */
import {Glyph, GlyphView, GlyphData} from "./glyph";
import {NumberSpec, DistanceSpec, AngleSpec, StringSpec} from "core/vectorization"
import {Arrayable} from "core/types"
import {Anchor} from "core/enums"
import {logger} from "core/logging";
import * as p from "core/properties"
import {Context2d} from "core/util/canvas"
import {SpatialIndex, RBush} from "core/util/spatial"

export interface ImageURLData extends GlyphData {
}

export interface ImageURLView extends ImageURLData {}

export class ImageURLView extends GlyphView {
  model: ImageURL
  visuals: ImageURL.Visuals

  initialize(options: any): void {
    super.initialize(options);
    this.connect(this.model.properties.global_alpha.change, () => this.renderer.request_render());
  }

  protected _index_data(): SpatialIndex {
    return new RBush([])
  }

  _set_data() {
    if ((this.image == null) || (this.image.length !== this._url.length))
      this.image = this._url.map((_) => null)

    const {retry_attempts, retry_timeout} = this.model;

    this.retries = this._url.map((_) => retry_attempts)

    for (let i = 0, end = this._url.length; i < end; i++) {
      if ((this._url[i] == null))
        continue;

      const img = new Image();
      img.onerror = ((i, img) => {
        return () => {
          if (this.retries[i] > 0) {
            logger.trace(`ImageURL failed to load ${this._url[i]} image, retrying in ${retry_timeout} ms`);
            setTimeout(() => img.src = this._url[i], retry_timeout);
          } else {
            logger.warn(`ImageURL unable to load ${this._url[i]} image after ${retry_attempts} retries`);
          }
          return this.retries[i] -= 1;
        };
      })(i, img);
      img.onload = ((img, i) => {
        return () => {
          this.image[i] = img;
          return this.renderer.request_render();
        };
      })(img, i);
      img.src = this._url[i];
    }
  }

  has_finished(): boolean {
    return super.has_finished() && this._images_rendered === true;
  }

  protected _map_data(): void {
    // Better to check @model.w and @model.h for null since the set_data
    // machinery will have converted @_w and @_w to lists of null
    const ws = ((this.model.w != null) ? this._w : (() => {
      const result = [];
      for (const _ of this._x) {
        result.push(NaN);
      }
      return result;
    })());
    const hs = ((this.model.h != null) ? this._h : (() => {
      const result1 = [];
      for (const _ of this._x) {
        result1.push(NaN);
      }
      return result1;
    })());

    switch (this.model.properties.w.units) {
      case "data": {
        this.sw = this.sdist(this.renderer.xscale, this._x, ws, 'edge', this.model.dilate)
        break
      }
      case "screen": {
        this.sw = ws
        break
      }
    }

    switch (this.model.properties.h.units) {
      case "data": {
        this.sh = this.sdist(this.renderer.yscale, this._y, hs, 'edge', this.model.dilate)
        break
      }
      case "screen": {
        this.sh = hs
        break
      }
    }
  }

  protected _render(ctx: Context2d, indices: number[],
                    {_url, image, sx, sy, sw, sh, _angle}: ImageURLData): void {

    // TODO (bev): take actual border width into account when clipping
    const { frame } = this.renderer.plot_view;
    ctx.rect(
      frame._left.value+1, frame._top.value+1,
      frame._width.value-2, frame._height.value-2,
    );
    ctx.clip();

    let finished = true;

    for (const i of indices) {
      if (isNaN(sx[i] + sy[i] + _angle[i]))
        continue;

      if (this.retries[i] === -1)
        continue;

      if ((image[i] == null)) {
        finished = false;
        continue;
      }

      this._render_image(ctx, i, image[i], sx, sy, sw, sh, _angle);
    }

    if (finished && !this._images_rendered) {
      this._images_rendered = true;
      this.notify_finished();
    }
  }

  protected _final_sx_sy(anchor: Anchor, sx: number, sy: number, sw: number, sh: number): [number, number] {
    switch (anchor) {
      case 'top_left':      return [sx         , sy         ];
      case 'top_center':    return [sx - (sw/2), sy         ];
      case 'top_right':     return [sx - sw    , sy         ];
      case 'center_right':  return [sx - sw    , sy - (sh/2)];
      case 'bottom_right':  return [sx - sw    , sy - sh    ];
      case 'bottom_center': return [sx - (sw/2), sy - sh    ];
      case 'bottom_left':   return [sx         , sy - sh    ];
      case 'center_left':   return [sx         , sy - (sh/2)];
      case 'center':        return [sx - (sw/2), sy - (sh/2)];
    }
  }

  protected _render_image(ctx: Context2d, i: number, image,
                          sx: Arrayable<number>, sy: Arrayable<number>,
                          sw: Arrayable<number>, sh: Arrayable<number>, angle: Arrayable<number>): void {
    if (isNaN(sw[i])) sw[i] = image.width
    if (isNaN(sh[i])) sh[i] = image.height

    const {anchor} = this.model;
    const [sxi, syi] = this._final_sx_sy(anchor, sx[i], sy[i], sw[i], sh[i]);

    ctx.save();
    ctx.globalAlpha = this.model.global_alpha;

    if (angle[i]) {
      ctx.translate(sxi, syi);
      ctx.rotate(angle[i]);
      ctx.drawImage(image, 0, 0, sw[i], sh[i]);
      ctx.rotate(-angle[i]);
      ctx.translate(-sxi, -syi);
    } else
      ctx.drawImage(image, sxi, syi, sw[i], sh[i]);

    ctx.restore();
  }
}

export namespace ImageURL {
  export interface Attrs extends Glyph.Attrs {
    x: NumberSpec
    y: NumberSpec
    url: StringSpec
    anchor: Anchor
    global_alpha: number
    angle: AngleSpec
    w: DistanceSpec
    h: DistanceSpec
    dilate: boolean
    retry_attempts: number
    retry_timeout: number
  }

  export interface Props extends Glyph.Props {}

  export interface Visuals extends Glyph.Visuals {}
}

export interface ImageURL extends ImageURL.Attrs {}

export class ImageURL extends Glyph {

  properties: ImageURL.Props

  constructor(attrs?: Partial<ImageURL.Attrs>) {
    super(attrs)
  }

  static initClass(): void {
    this.prototype.type = 'ImageURL';
    this.prototype.default_view = ImageURLView;

    this.coords([['x', 'y']]);
    this.define({
      url:            [ p.StringSpec            ],
      anchor:         [ p.Anchor,    'top_left' ],
      global_alpha:   [ p.Number,    1.0        ],
      angle:          [ p.AngleSpec, 0          ],
      w:              [ p.DistanceSpec          ],
      h:              [ p.DistanceSpec          ],
      dilate:         [ p.Bool,      false      ],
      retry_attempts: [ p.Number,    0          ],
      retry_timeout:  [ p.Number,    0          ],
    });
  }
}
ImageURL.initClass();
