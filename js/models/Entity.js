import { uid } from '../utils/uid.js';
import { Attribute } from './Attribute.js';

export class Entity {
  constructor(name = 'ENTIDAD', x = 100, y = 100) {
    this.id = uid(); this.name = name; this.x = x; this.y = y;
    this.attributes = []; this.width = 180; this.headerH = 34; this.attrH = 23; this.footerH = 25;
    this.isWeak = false; // entidad débil: doble borde
  }

  get height() { return this.headerH + this.attributes.length * this.attrH + this.footerH; }

  addAttribute(attr)  { this.attributes.push(attr); }
  removeAttribute(id) { this.attributes = this.attributes.filter(a => a.id !== id); }

  getPorts() {
    const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
    return {
      top:    { x: cx,                  y: this.y,                  side: 'top'    },
      bottom: { x: cx,                  y: this.y + this.height,    side: 'bottom' },
      left:   { x: this.x,              y: cy,                      side: 'left'   },
      right:  { x: this.x + this.width, y: cy,                      side: 'right'  },
    };
  }

  getNearestPort(point) {
    let nearest = null, minDist = Infinity;
    for (const port of Object.values(this.getPorts())) {
      const d = Math.hypot(port.x - point.x, port.y - point.y);
      if (d < minDist) { minDist = d; nearest = port; }
    }
    return nearest;
  }

  /** Igual que getNearestPort pero excluye ciertos lados (para entidades con autoreferencia) */
  getNearestPortExcluding(point, excludeSides = []) {
    let nearest = null, minDist = Infinity;
    for (const port of Object.values(this.getPorts())) {
      if (excludeSides.includes(port.side)) continue;
      const d = Math.hypot(port.x - point.x, port.y - point.y);
      if (d < minDist) { minDist = d; nearest = port; }
    }
    // Si todos están excluidos, caer al más cercano sin restricción
    return nearest || this.getNearestPort(point);
  }

  toJSON() {
    return { id: this.id, name: this.name, x: this.x, y: this.y,
             isWeak: this.isWeak,
             attributes: this.attributes.map(a => a.toJSON()) };
  }

  static fromJSON(d) {
    const e = new Entity(d.name, d.x, d.y);
    e.id = d.id;
    e.isWeak = d.isWeak === true; // compatibilidad con diagramas anteriores
    e.attributes = (d.attributes || []).map(a => Attribute.fromJSON(a));
    return e;
  }
}