import { svgEl } from '../utils/svg.js';
import { domToSVGPoint } from '../utils/geometry.js';

export class SVGEntityRenderer {
  static render(entity, app) {
    const g  = svgEl('g');
    g.setAttribute('class', 'entity-group');
    g.setAttribute('data-id', entity.id);
    g.setAttribute('transform', `translate(${entity.x}, ${entity.y})`);

    const W = entity.width, HH = entity.headerH, AH = entity.attrH;

    // ── Caja principal ──
    g.appendChild(svgEl('rect', { class: 'entity-box', width: W, height: entity.height, rx: 8 }));

    // ── Doble borde para entidad débil ──
    if (entity.isWeak) {
      const M = 4;
      g.appendChild(svgEl('rect', {
        class: 'entity-weak-inner',
        x: M, y: M, width: W - M*2, height: entity.height - M*2, rx: 5,
      }));
    }

    g.appendChild(svgEl('rect', { class: 'entity-header', width: W, height: HH, rx: 8 }));
    g.appendChild(svgEl('rect', { class: 'entity-header', y: HH / 2, width: W, height: HH / 2 }));

    // ── Título ──
    const title = svgEl('text', { class: 'entity-title', x: W/2, y: HH/2,
      'dominant-baseline': 'middle', 'text-anchor': 'middle' });
    title.textContent = entity.name;
    title.style.cursor = 'text';
    title.addEventListener('dblclick', (e) => { e.stopPropagation(); app.startInlineEditTitle(entity, title, g); });
    g.appendChild(title);

    // ── Badge WEAK con tooltip didáctico ──
    if (entity.isWeak) {
      const badge = svgEl('g', { class: 'entity-weak-badge' });
      badge.style.cursor = 'help';
      const br = svgEl('rect', { x: W - 42, y: 4, width: 36, height: 14, rx: 3,
        fill: 'var(--weak-badge-bg)', stroke: 'var(--weak-badge-border)', 'stroke-width': '1' });
      const bt = svgEl('text', { x: W - 24, y: 11, 'dominant-baseline': 'middle', 'text-anchor': 'middle',
        'font-family': 'JetBrains Mono, monospace', 'font-size': '8', 'font-weight': '700',
        fill: 'var(--weak-badge-color)' });
      bt.textContent = 'DÉBIL';
      badge.appendChild(br); badge.appendChild(bt);
      badge.addEventListener('mouseenter', (e) => {
        const hasIdentifying = app.diagram.relationships.some(
          r => r.identifying && (r.fromId === entity.id || r.toId === entity.id)
        );
        SVGEntityRenderer._showWeakTooltip(e, entity, hasIdentifying);
      });
      badge.addEventListener('mousemove', SVGEntityRenderer._moveTooltip);
      badge.addEventListener('mouseleave', SVGEntityRenderer._hideTooltip);
      g.appendChild(badge);
    }

    // ── Botón toggle entidad débil ──
    const weakBtn = svgEl('g', { class: 'entity-weak-toggle',
      title: entity.isWeak ? 'Convertir a entidad normal' : 'Marcar como entidad débil' });
    const weakBtnBg = svgEl('rect', { x: 4, y: 4, width: 14, height: 14, rx: 3,
      fill: entity.isWeak ? 'var(--weak-btn-active)' : 'transparent',
      stroke: entity.isWeak ? 'var(--weak-badge-border)' : 'transparent', 'stroke-width': '1' });
    const weakBtnIco = svgEl('text', { x: 11, y: 11, 'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-size': '9', fill: entity.isWeak ? 'var(--weak-badge-color)' : 'var(--fg-subtle)' });
    weakBtnIco.textContent = 'D';
    weakBtn.appendChild(weakBtnBg); weakBtn.appendChild(weakBtnIco);
    weakBtn.style.cursor = 'pointer';
    weakBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      entity.isWeak = !entity.isWeak;
      app._refreshEntity(entity);
      app._checkWeakEntities();
    });
    g.appendChild(weakBtn);

    g.appendChild(svgEl('line', { class: 'attr-sep', x1: 0, y1: HH, x2: W, y2: HH }));
    entity.attributes.forEach((attr, i) => g.appendChild(SVGEntityRenderer._attrRow(attr, entity, i, app)));

    const addY = HH + entity.attributes.length * AH;
    const addGrp = svgEl('g', { class: 'add-attr-btn' });
    const addBg  = svgEl('rect', { x: 0, y: addY, width: W, height: entity.footerH, rx: 8 });
    addBg.style.fill = 'transparent';
    addGrp.appendChild(addBg);
    const addTxt = svgEl('text', { x: W/2, y: addY + entity.footerH/2,
      'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-family': 'JetBrains Mono, monospace', 'font-size': '11', fill: 'var(--fg-subtle)' });
    addTxt.textContent = '+ Agregar atributo';
    addGrp.appendChild(addTxt);
    addGrp.addEventListener('click', (e) => { e.stopPropagation(); app.openAttrEditor(entity, null, g); });
    g.appendChild(addGrp);

    addGrp.addEventListener('click', (e) => { e.stopPropagation(); app.openAttrEditor(entity, null, g); });
    g.appendChild(addGrp);

    SVGEntityRenderer._renderPorts(entity, g, app);
    SVGEntityRenderer._attachDrag(entity, g, app);
    return g;
  }

  static _attrRow(attr, entity, index, app) {
    const W = entity.width, HH = entity.headerH, AH = entity.attrH;
    const y = HH + index * AH;
    const row = svgEl('g', { class: 'attr-row', 'data-attr-id': attr.id });
    row.style.cursor = 'pointer';

    if (index > 0) row.appendChild(svgEl('line', { class: 'attr-sep', x1: 8, y1: y, x2: W-8, y2: y }));

    let xOff = 10;
    if (attr.pk) { row.appendChild(SVGEntityRenderer._badge('PK', xOff, y+AH/2, 'var(--pk-color)', 'var(--pk-bg)')); xOff += 26; }
    if (attr.fk) { row.appendChild(SVGEntityRenderer._badge('FK', xOff, y+AH/2, 'var(--accent2)', 'var(--accent2-dim)')); xOff += 26; }
    if (attr.unique && !attr.pk) { row.appendChild(SVGEntityRenderer._badge('UQ', xOff, y+AH/2, 'var(--success)', 'var(--uq-bg)')); xOff += 26; }

    // Calcular el ancho disponible para el nombre, dejando espacio para el tipo de dato
    const TYPE_RESERVED = attr.typeLabel ? Math.max(attr.typeLabel.length * 6.2 + 16, 50) : 8;
    const nameMaxWidth = Math.max(W - xOff - TYPE_RESERVED, 20);

    // Estimar si el nombre completo entra en el espacio disponible (≈6.2px por carácter a 11.5px monospace)
    const fullName = attr.name + (attr.nn ? ' *' : '');
    const CHAR_W = 6.5;
    const maxChars = Math.floor(nameMaxWidth / CHAR_W);
    const truncated = fullName.length > maxChars;
    const displayName = truncated ? fullName.slice(0, Math.max(maxChars - 1, 1)) + '…' : fullName;

    const nameEl = svgEl('text', { x: xOff, y: y+AH/2, 'dominant-baseline': 'middle',
      'font-family': 'JetBrains Mono, monospace', 'font-size': '11.5',
      fill: attr.pk ? 'var(--pk-color)' : (attr.fk ? 'var(--accent2)' : 'var(--fg)') });
    nameEl.textContent = displayName;
    if (truncated) {
      // Tooltip nativo del navegador con el nombre completo al hacer hover
      const titleEl = svgEl('title', {});
      titleEl.textContent = fullName;
      nameEl.appendChild(titleEl);
    }
    row.appendChild(nameEl);

    if (attr.typeLabel) {
      const typeEl = svgEl('text', { x: W - 8, y: y+AH/2, 'dominant-baseline': 'middle',
        'text-anchor': 'end', 'font-family': 'JetBrains Mono, monospace', 'font-size': '10',
        fill: 'var(--fg-subtle)' });
      typeEl.textContent = attr.typeLabel;
      row.appendChild(typeEl);
    }

    // El rect de fondo va AL FINAL del grupo para quedar encima en eventos,
    // pero con fill transparente para no tapar los textos visualmente.
    // Esto garantiza que el hover y el dblclick funcionen en toda el área del atributo.
    const bg = svgEl('rect', { x: 0, y, width: W, height: AH, fill: 'transparent' });
    bg.addEventListener('mouseenter', () => bg.setAttribute('fill', 'rgba(255,255,255,0.03)'));
    bg.addEventListener('mouseleave', () => bg.setAttribute('fill', 'transparent'));
    row.appendChild(bg);

    // dblclick en el rect (que está encima de todo) abre el editor
    bg.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      app.openAttrEditor(entity, attr, document.querySelector(`[data-id="${entity.id}"]`));
    });
    return row;
  }

  static _showWeakTooltip(e, entity, hasIdentifying) {
    SVGEntityRenderer._hideTooltip();
    const tip = document.createElement('div');
    tip.id = 'weak-tooltip';
    tip.className = 'weak-tooltip' + (hasIdentifying ? '' : ' weak-tooltip-warn');
    if (hasIdentifying) {
      tip.innerHTML = `
        <div class="wtt-title">✓ Entidad Débil</div>
        <div class="wtt-body">
          Esta entidad depende de otra para existir.<br>
          Tiene una <strong>relación identificadora</strong> conectada.
        </div>`;
    } else {
      tip.innerHTML = `
        <div class="wtt-title">⚠ Entidad Débil sin relación identificadora</div>
        <div class="wtt-body">
          Las entidades débiles <strong>necesitan una relación identificadora</strong>
          que las conecte con su entidad fuerte.<br><br>
          <span class="wtt-action">¿Cómo resolverlo?</span><br>
          Creá una relación con otra entidad y marcá el
          checkbox <em>"Relación identificadora"</em> en el diálogo.
        </div>`;
    }
    document.body.appendChild(tip);
    SVGEntityRenderer._moveTooltip(e);
  }

  static _moveTooltip(e) {
    const tip = document.getElementById('weak-tooltip');
    if (!tip) return;
    const margin = 14;
    let x = e.clientX + margin;
    let y = e.clientY + margin;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - margin;
    if (y + th > window.innerHeight - 8) y = e.clientY - th - margin;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  }

  static _hideTooltip() {
    const tip = document.getElementById('weak-tooltip');
    if (tip) tip.remove();
  }

  static _badge(text, x, cy, color, bg) {
    const g = svgEl('g');
    g.appendChild(svgEl('rect', { x: x-1, y: cy-8, width: 22, height: 14, rx: 3, fill: bg }));
    const t = svgEl('text', { x: x+10, y: cy, 'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-family': 'JetBrains Mono, monospace', 'font-size': '9', 'font-weight': '700', fill: color });
    t.textContent = text;
    g.appendChild(t);
    return g;
  }

  static _renderPorts(entity, g, app) {
    const W = entity.width, H = entity.height;
    [{ x:W/2, y:0, side:'top' }, { x:W/2, y:H, side:'bottom' },
     { x:0, y:H/2, side:'left' }, { x:W, y:H/2, side:'right' }].forEach(p => {
      const c = svgEl('circle', { class: 'port-dot', cx: p.x, cy: p.y, r: 5, 'data-side': p.side });
      c.addEventListener('mousedown', (e) => {
        if (app.currentTool === 'relation') { e.stopPropagation(); app.startRelationFrom(entity, e); }
      });
      g.appendChild(c);
    });
  }

  static _attachDrag(entity, g, app) {
    let dragging = false, startMouse, startPos;
    g.addEventListener('mousedown', (e) => {
      if (app.currentTool === 'delete') { app.deleteEntity(entity.id); return; }
      if (app.currentTool === 'relation') return;
      if (e.button !== 0) return;
      app.selectElement('entity', entity.id);
      dragging = true;
      startMouse = domToSVGPoint(app.svgCanvas, e.clientX, e.clientY);
      startPos   = { x: entity.x, y: entity.y };
      e.stopPropagation(); e.preventDefault();
      const onMove = (ev) => {
        if (!dragging) return;
        const cur = domToSVGPoint(app.svgCanvas, ev.clientX, ev.clientY);
        entity.x = startPos.x + (cur.x - startMouse.x);
        entity.y = startPos.y + (cur.y - startMouse.y);
        g.setAttribute('transform', `translate(${entity.x}, ${entity.y})`);
        app.updateRelationships();
      };
      const onUp = () => {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}