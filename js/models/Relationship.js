import { uid } from '../utils/uid.js';
import { Attribute } from './Attribute.js';

export class Relationship {
  constructor(fromId, toId, cardFrom = '1', cardTo = '0..N', label = '', identifying = false, roleFrom = '', roleTo = '', attributes = []) {
    this.id = uid(); this.fromId = fromId; this.toId = toId;
    this.cardFrom = cardFrom; this.cardTo = cardTo; this.label = label;
    this.identifying = identifying; // relación identificadora: línea continua
    this.roleFrom = roleFrom; // rol del extremo origen (ej: 'gerente')
    this.roleTo   = roleTo;   // rol del extremo destino (ej: 'empleado')
    this.attributes = [...attributes]; // atributos propios de la relación (notación Chen)
  }

  addAttribute(attr)  { this.attributes.push(attr); }
  removeAttribute(id) { this.attributes = this.attributes.filter(a => a.id !== id); }

  static cardToType(card) {
    const map = { '1': 'one', '0..1': 'zero_one', '1..N': 'one_many', '0..N': 'zero_many' };
    return map[card] || 'one';
  }

  toJSON() {
    return { id: this.id, fromId: this.fromId, toId: this.toId,
             cardFrom: this.cardFrom, cardTo: this.cardTo, label: this.label,
             identifying: this.identifying,
             roleFrom: this.roleFrom || '', roleTo: this.roleTo || '',
             attributes: this.attributes.map(a => a.toJSON()) };
  }

  static fromJSON(d) {
    let cardFrom = d.cardFrom, cardTo = d.cardTo;
    if (!cardFrom || !cardTo) {
      const m = { '1:1':{f:'1',t:'1'}, '1:N':{f:'1',t:'0..N'}, 'N:1':{f:'0..N',t:'1'}, 'N:M':{f:'0..N',t:'0..N'} };
      const lg = m[d.cardinality] || {f:'1',t:'0..N'};
      cardFrom = lg.f; cardTo = lg.t;
    }
    // Retrocompatibilidad: diagramas guardados antes de esta función no tienen 'attributes'
    const attrs = (d.attributes || []).map(a => Attribute.fromJSON(a));
    const r = new Relationship(d.fromId, d.toId, cardFrom, cardTo, d.label || '', d.identifying === true, d.roleFrom || '', d.roleTo || '', attrs);
    r.id = d.id;
    return r;
  }
}