import { svgEl } from '../utils/svg.js';
import { CrowsFootRenderer } from './CrowsFootRenderer.js';
import { Relationship } from '../models/Relationship.js';

export class SVGRelationRenderer {
  static render(rel, fromEnt, toEnt, app) {
    const g = svgEl('g');
    g.setAttribute('class', 'rel-group');
    g.setAttribute('data-rel-id', rel.id);
    SVGRelationRenderer.update(g, rel, fromEnt, toEnt);
    g.addEventListener('click', (e) => {
      if (app.currentTool === 'delete') { app.deleteRelationship(rel.id); return; }
      e.stopPropagation(); app.selectElement('relationship', rel.id);
    });
    g.addEventListener('dblclick', (e) => {
      e.stopPropagation(); app.openRelModal(rel.fromId, rel.toId, rel);
    });
    return g;
  }

  static update(g, rel, fromEnt, toEnt, fromPort = null, toPort = null) {
    while (g.firstChild) g.removeChild(g.firstChild);

    if (rel.fromId === rel.toId) {
      SVGRelationRenderer._updateSelfRef(g, rel, fromEnt);
      return;
    }

    const fromCenter = { x: fromEnt.x + fromEnt.width/2,  y: fromEnt.y + fromEnt.height/2 };
    const toCenter   = { x: toEnt.x   + toEnt.width/2,    y: toEnt.y   + toEnt.height/2   };
    fromPort = fromPort || fromEnt.getNearestPort(toCenter);
    toPort   = toPort   || toEnt.getNearestPort(fromCenter);

    // ── Path ortogonal en L ───────────────────────────────────────────────
    // Sale perpendicular al borde de la entidad origen, hace un codo,
    // y llega perpendicular al borde de la entidad destino.
    // Esto garantiza que los marcadores Crow's Foot siempre queden alineados
    // con el borde independientemente del ángulo entre entidades.
    const path = SVGRelationRenderer._orthogonalPath(fromPort, toPort);

    // Área de clic invisible
    g.appendChild(svgEl('path', {
      d: path, fill: 'none', stroke: 'transparent', 'stroke-width': '14',
    }));

    // Línea visible
    g.appendChild(svgEl('path', {
      d: path,
      class: rel.identifying ? 'rel-line rel-line-identifying' : 'rel-line rel-line-regular',
    }));

    // ── Anchors fijos perpendiculares al borde ────────────────────────────
    // En vez de usar el port opuesto como anchor (que cambia según la diagonal),
    // usamos un punto a 30px afuera del port siguiendo la dirección del lado.
    // Esto hace que el ángulo del marcador sea siempre 0°/90°/180°/270°.
    const anchorFrom = SVGRelationRenderer._sideAnchor(fromPort);
    const anchorTo   = SVGRelationRenderer._sideAnchor(toPort);

    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardFrom), fromPort, anchorFrom, 'cf-mark');
    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardTo),   toPort,   anchorTo,   'cf-mark-dest');

    if (rel.label) {
      const mid = SVGRelationRenderer._pathMidpoint(fromPort, toPort);
      g.appendChild(svgEl('rect', {
        x: mid.x - 36, y: mid.y - 9, width: 72, height: 16, rx: 4,
        fill: 'var(--bg2)', opacity: '0.92',
      }));
      const lbl = svgEl('text', { class: 'rel-name-label', x: mid.x, y: mid.y,
        'font-family': 'JetBrains Mono, monospace', 'font-size': '10' });
      lbl.textContent = rel.label;
      g.appendChild(lbl);
    }

    SVGRelationRenderer._roleLabel(g, rel.roleFrom, fromPort, fromPort.side);
    SVGRelationRenderer._roleLabel(g, rel.roleTo,   toPort,   toPort.side);

    // ── Atributos de la relación (notación Chen) ──────────────────────────
    // Cuelgan con línea punteada desde el punto medio de la línea principal.
    if (rel.attributes && rel.attributes.length > 0) {
      const mid = SVGRelationRenderer._pathMidpoint(fromPort, toPort);
      SVGRelationRenderer._drawRelAttributes(g, rel.attributes, mid, !!rel.label);
    }
  }

  /**
   * Genera un anchor a 30px fuera del port, en la dirección perpendicular
   * al lado de la entidad. Esto fija el ángulo del marcador independientemente
   * de dónde esté la otra entidad.
   */
  static _sideAnchor(port) {
    const DIST = 30;
    const offsets = {
      right:  { dx:  DIST, dy: 0     },
      left:   { dx: -DIST, dy: 0     },
      bottom: { dx: 0,     dy:  DIST },
      top:    { dx: 0,     dy: -DIST },
    };
    const off = offsets[port.side] || { dx: DIST, dy: 0 };
    return { x: port.x + off.dx, y: port.y + off.dy };
  }

  /**
   * Construye un path SVG ortogonal (en L o Z) entre dos ports.
   * Sale perpendicular al borde de cada entidad y se dobla en el medio.
   */
  static _orthogonalPath(from, to) {
    const fx = from.x, fy = from.y;
    const tx = to.x,   ty = to.y;

    // Punto de codo: a mitad de camino entre los dos ports
    let mx, my;

    // Si salen del mismo eje (ambos left/right o ambos top/bottom):
    // el codo va a la mitad del eje compartido
    const fromH = from.side === 'left' || from.side === 'right'; // horizontal
    const toH   = to.side   === 'left' || to.side   === 'right';

    if (fromH && toH) {
      // Ambos horizontales → codo vertical en X media
      mx = (fx + tx) / 2;
      return `M ${fx} ${fy} L ${mx} ${fy} L ${mx} ${ty} L ${tx} ${ty}`;
    } else if (!fromH && !toH) {
      // Ambos verticales → codo horizontal en Y media
      my = (fy + ty) / 2;
      return `M ${fx} ${fy} L ${fx} ${my} L ${tx} ${my} L ${tx} ${ty}`;
    } else if (fromH && !toH) {
      // From horizontal, to vertical → L simple
      return `M ${fx} ${fy} L ${tx} ${fy} L ${tx} ${ty}`;
    } else {
      // From vertical, to horizontal → L simple
      return `M ${fx} ${fy} L ${fx} ${ty} L ${tx} ${ty}`;
    }
  }

  /**
   * Punto medio visual del path ortogonal (para el label).
   */
  static _pathMidpoint(from, to) {
    return {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
    };
  }

  /**
   * Relación autoreferenciada con segmentos ortogonales.
   * Lazo en la esquina inferior-derecha:
   *   portBottom → A → B → C → portRight
   */
  static _updateSelfRef(g, rel, entity) {
    const { x: ex, y: ey, width: W, height: H } = entity;
    const GAP = 36;

    // El lazo se ancla en la ESQUINA inferior-derecha, no en los centros de los lados.
    // Usamos el 80% del ancho (sobre el borde inferior) y el 80% del alto (sobre el borde derecho),
    // dejando los centros de ambos lados libres para relaciones normales.
    const CORNER = 0.80;

    const portBottom = { x: ex + W * CORNER, y: ey + H, side: 'bottom' };
    const portRight  = { x: ex + W,          y: ey + H * CORNER, side: 'right' };

    const A = { x: ex + W * CORNER, y: ey + H + GAP };
    const B = { x: ex + W + GAP,    y: ey + H + GAP };
    const C = { x: ex + W + GAP,    y: ey + H * CORNER };

    const points = [portBottom, A, B, C, portRight]
      .map(p => `${p.x},${p.y}`)
      .join(' ');

    g.appendChild(svgEl('polyline', {
      points, fill: 'none', stroke: 'transparent', 'stroke-width': '14',
    }));

    g.appendChild(svgEl('polyline', {
      points,
      class: rel.identifying ? 'rel-line rel-line-identifying' : 'rel-line rel-line-regular',
      fill: 'none',
    }));

    const anchorBottom = A;
    const anchorRight  = C;

    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardFrom), portBottom, anchorBottom, 'cf-mark');
    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardTo),   portRight,  anchorRight,  'cf-mark-dest');

    const labelX = (A.x + B.x) / 2;
    const labelY = A.y + 12;
    if (rel.label) {
      const lw = Math.max(rel.label.length * 6.5, 52);
      g.appendChild(svgEl('rect', {
        x: labelX - lw/2, y: labelY - 8, width: lw, height: 15, rx: 3,
        fill: 'var(--bg2)', opacity: '0.95',
      }));
      const lbl = svgEl('text', {
        class: 'rel-name-label', x: labelX, y: labelY,
        'font-family': 'JetBrains Mono, monospace', 'font-size': '10',
      });
      lbl.textContent = rel.label;
      g.appendChild(lbl);
    }

    SVGRelationRenderer._roleLabel(g, rel.roleFrom, portBottom, 'bottom');
    SVGRelationRenderer._roleLabel(g, rel.roleTo,   portRight,  'right');

    // Atributos de la relación, colgando debajo de la etiqueta del lazo
    if (rel.attributes && rel.attributes.length > 0) {
      const attrAnchor = { x: labelX, y: labelY };
      SVGRelationRenderer._drawRelAttributes(g, rel.attributes, attrAnchor, !!rel.label);
    }
  }

  /**
   * Calcula un punto distribuido a lo largo de un lado de una entidad.
   * Divide el lado en (count+1) segmentos iguales y devuelve el i-ésimo punto.
   * Mantiene un margen del 15% en cada extremo para no llegar a las esquinas.
   *
   * @param {Entity} entity  - La entidad
   * @param {string} side    - 'top'|'bottom'|'left'|'right'
   * @param {number} index   - Índice de esta relación en el grupo (0-based)
   * @param {number} count   - Total de relaciones en este lado
   * @returns {{ x, y, side }}
   */
  static _distributedPort(entity, side, index, count, restrictCorner = false) {
    // MARGIN normal: 15% en cada extremo
    // restrictCorner: el lazo ocupa el 80% final → limitar al primer 70% del lado
    const MARGIN_START = 0.15;
    const MARGIN_END   = restrictCorner ? 0.30 : 0.15; // más margen al final si hay lazo
    const t = MARGIN_START + (1 - MARGIN_START - MARGIN_END) * (index / (count - 1 || 1));

    const { x, y, width: W, height: H } = entity;
    let px, py;

    if (side === 'top'    || side === 'bottom') {
      px = x + W * t;
      py = side === 'top' ? y : y + H;
    } else {
      px = side === 'left' ? x : x + W;
      py = y + H * t;
    }
    return { x: px, y: py, side };
  }

  /**
   * Dibuja los atributos propios de la relación, colgando con línea punteada
   * desde el punto medio de la línea principal (notación Chen).
   * Cada atributo adicional se distribuye en abanico para no superponerse.
   *
   * @param {SVGGElement} g          Grupo SVG de la relación
   * @param {Attribute[]} attrs      Atributos a dibujar
   * @param {{x,y}}       anchor     Punto desde donde cuelgan (centro de la línea)
   * @param {boolean}     hasLabel   Si la relación ya tiene un label de nombre,
   *                                 desplazamos los atributos para no superponerlos
   */
  static _drawRelAttributes(g, attrs, anchor, hasLabel) {
    const DROP = 38;         // distancia vertical del primer atributo
    const SPACING = 30;      // separación horizontal entre atributos múltiples
    const baseY = anchor.y + (hasLabel ? 20 : 0);

    // Distribuir los atributos en abanico horizontal si hay más de uno
    const n = attrs.length;
    attrs.forEach((attr, i) => {
      // Offset horizontal centrado: -n/2 .. +n/2
      const offsetX = (i - (n - 1) / 2) * SPACING;
      const dropX = anchor.x + offsetX;
      const dropY = baseY + DROP;

      // Línea punteada que conecta el centro de la relación con el atributo
      g.appendChild(svgEl('line', {
        x1: anchor.x, y1: baseY,
        x2: dropX,    y2: dropY - 7,
        class: 'rel-attr-line',
      }));

      // Óvalo/elipse con el nombre del atributo (estilo Chen clásico)
      const text = attr.name + (attr.typeLabel ? '' : '');
      const ew = Math.max(text.length * 6.5 + 16, 40);
      const eh = 16;

      g.appendChild(svgEl('ellipse', {
        cx: dropX, cy: dropY, rx: ew/2, ry: eh/2,
        class: 'rel-attr-ellipse',
      }));

      const lbl = svgEl('text', {
        x: dropX, y: dropY,
        'dominant-baseline': 'middle', 'text-anchor': 'middle',
        class: 'rel-attr-label',
        'font-family': 'JetBrains Mono, monospace',
        'font-size': '10',
      });
      lbl.textContent = text;
      g.appendChild(lbl);
    });
  }

  static _roleLabel(g, role, port, side) {
    if (!role) return;
    const offsets = {
      right:  { dx:  8, dy: -14 },
      left:   { dx: -8, dy: -14 },
      bottom: { dx: 14, dy:  12 },
      top:    { dx: 14, dy: -12 },
    };
    const off = offsets[side] || { dx: 8, dy: -14 };
    const lbl = svgEl('text', {
      x: port.x + off.dx, y: port.y + off.dy,
      'dominant-baseline': 'middle',
      'text-anchor': side === 'right' ? 'start' : (side === 'left' ? 'end' : 'middle'),
      'font-family': 'JetBrains Mono, monospace',
      'font-size': '9',
      'font-style': 'italic',
      fill: 'var(--fg-subtle)',
    });
    lbl.textContent = '«' + role + '»';
    g.appendChild(lbl);
  }
}