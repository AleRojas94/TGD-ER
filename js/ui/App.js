import { Diagram }                    from '../models/Diagram.js';
import { Entity }                     from '../models/Entity.js';
import { Attribute }                  from '../models/Attribute.js';
import { Relationship }               from '../models/Relationship.js';
import { Generalization }             from '../models/Generalization.js';
import { SVGEntityRenderer }          from '../renderers/SVGEntityRenderer.js';
import { SVGRelationRenderer }        from '../renderers/SVGRelationRenderer.js';
import { SVGGeneralizationRenderer }  from '../renderers/SVGGeneralizationRenderer.js';
import { svgEl }                      from '../utils/svg.js';
import { domToSVGPoint }              from '../utils/geometry.js';

export class App {
  constructor() {
    this.diagram      = new Diagram();
    this.currentTool  = 'select';
    this.selectedId   = null;
    this.selectedType = null;

    this.panX = 0; this.panY = 0; this.scale = 1;
    this._isPanning = false; this._panStart = null; this._panOrigin = null;

    this._relFromEntity  = null;
    this._relPreviewLine = null;
    this._editingRel     = null;
    this._relAttrsDraft  = []; // borrador editable de atributos de relación (notación Chen)
    this._spaceDown      = false;
    this._prevTool       = 'select';
    this._fileHandle     = null;       // FileSystemFileHandle del archivo abierto
    this._lastFilename   = null;       // nombre sin extensión para sugerencias

    // Estado para creación de generalización
    this._genSupertype   = null;   // entidad supertipo seleccionada
    this._genSubtypes    = [];     // entidades subtipo seleccionadas
    this._editingGen     = null;   // Generalization en edición

    this.svgCanvas     = document.getElementById('svg-canvas');
    this.diagRoot      = document.getElementById('diagram-root');
    this.canvasArea    = document.getElementById('canvas-area');
    this.canvasHint    = document.getElementById('canvas-hint');
    this.zoomLabel     = document.getElementById('zoom-label');
    this.toolIndicator = document.getElementById('tool-indicator-text');
    this._init();
  }

  _init() {
    this._bindToolButtons(); this._bindTopbarButtons(); this._bindCanvasEvents();
    this._bindKeyboard(); this._bindRelModal(); this._bindGenModal();
    this._updateToolUI(); this._loadExample();
  }

  _loadExample() {
    const cliente = new Entity('CLIENTE', 60, 80);
    cliente.addAttribute(new Attribute('id_cliente', true, false, true));
    cliente.addAttribute(new Attribute('nombre', false, false, true));
    cliente.addAttribute(new Attribute('apellido', false, false, true));
    cliente.addAttribute(new Attribute('email', false, false, false));
    const pedido = new Entity('PEDIDO', 360, 80);
    pedido.addAttribute(new Attribute('id_pedido', true, false, true));
    pedido.addAttribute(new Attribute('fecha', false, false, true));
    pedido.addAttribute(new Attribute('total', false, false, true));
    pedido.addAttribute(new Attribute('id_cliente', false, true, true));
    const producto = new Entity('PRODUCTO', 360, 340);
    producto.addAttribute(new Attribute('id_producto', true, false, true));
    producto.addAttribute(new Attribute('nombre', false, false, true));
    producto.addAttribute(new Attribute('precio', false, false, true));
    producto.addAttribute(new Attribute('stock', false, false, false));
    this.diagram.addEntity(cliente);
    this.diagram.addEntity(pedido);
    this.diagram.addEntity(producto);
    this.diagram.addRelationship(new Relationship(cliente.id, pedido.id,   '1',    '0..N', 'realiza'));
    this.diagram.addRelationship(new Relationship(pedido.id,  producto.id, '0..N', '0..N', 'contiene'));
    this.renderAll(); this.fitView();
  }

  // ── Herramientas ──────────────────────────────────────────────────────────
  _bindToolButtons() {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });
    document.getElementById('btn-fit').addEventListener('click',      () => this.fitView());
    document.getElementById('btn-zoom-in').addEventListener('click',  () => this.zoom(1.2));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.zoom(0.83));
  }

  setTool(tool) {
    this.currentTool = tool; this._updateToolUI(); this._cancelRelPreview();
    this._cancelGenFlow(); // cancelar selección de supertipo/subtipos pendiente
    this.deselect();
    const hints = { entity: 'Clic en el canvas para colocar una entidad',
                    relation: 'Clic en la entidad ORIGEN para iniciar la relación',
                    delete: 'Clic en una entidad o relación para eliminarla',
                    generalization: 'Clic en el SUPERTIPO, luego en los SUBTIPOS. Clic de nuevo en el supertipo para confirmar.',
                    select: '' };
    this._showHint(hints[tool] || '');
  }

  _updateToolUI() {
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === this.currentTool));
    this.canvasArea.className = `canvas-area tool-${this.currentTool}`;
    const names = { select: 'Seleccionar', entity: 'Agregar Entidad', relation: 'Agregar Relación', delete: 'Eliminar', pan: 'Mover Entorno', generalization: 'Agregar Jerarquía' };
    this.toolIndicator.textContent = names[this.currentTool] || this.currentTool;
  }

  _showHint(msg) { this.canvasHint.textContent = msg; this.canvasHint.classList.toggle('visible', !!msg); }

  // ── Topbar ────────────────────────────────────────────────────────────────
  _bindTopbarButtons() {
    document.getElementById('btn-new').addEventListener('click',         () => this.newDiagram());
    document.getElementById('btn-load').addEventListener('click',        () => this.openProject());
    document.getElementById('btn-save').addEventListener('click',        () => this.saveProject());
    document.getElementById('btn-save-as').addEventListener('click',     () => this.saveProjectAs());
    document.getElementById('btn-export-png').addEventListener('click',  () => this.exportPNG());
    document.getElementById('btn-export-json').addEventListener('click', () => this.exportJSON());
    document.getElementById('btn-theme-toggle').addEventListener('click',() => this.toggleTheme());
    document.getElementById('file-input').addEventListener('change', (e) => {
      if (e.target.files[0]) this.loadProject(e.target.files[0]); e.target.value = '';
    });
  }

  /**
   * Alterna entre tema oscuro (por defecto) y tema claro.
   * No persiste en localStorage — se resetea al recargar la página.
   */
  toggleTheme() {
    document.body.classList.toggle('theme-light');
    const isLight = document.body.classList.contains('theme-light');
    document.getElementById('theme-icon-sun')?.style.setProperty('display', isLight ? 'block' : 'none');
    document.getElementById('theme-icon-moon')?.style.setProperty('display', isLight ? 'none' : 'block');
    
  }

  // ── Canvas events ─────────────────────────────────────────────────────────
  _bindCanvasEvents() {
    this.svgCanvas.addEventListener('click', (e) => {
      if (e.target === this.svgCanvas || e.target.id === 'grid-bg') {
        this.deselect();
        if (this.currentTool === 'entity') {
          const pt = this._screenToWorld(e.clientX, e.clientY);
          this.addEntity(pt.x - 100, pt.y - 50);
        }
        if (this.currentTool === 'relation' && this._relFromEntity) {
          this._cancelRelPreview();
          this._showHint('Clic en la entidad ORIGEN para iniciar la relación');
        }
      }
    });
    this.canvasArea.addEventListener('mousedown', (e) => {
      if (e.button === 1) { this._startPan(e); e.preventDefault(); return; }
      if (e.button === 0 && (this.currentTool === 'pan' || this._spaceDown)) {
        this._startPan(e); e.preventDefault();
      }
    });
    this.canvasArea.addEventListener('mousemove', (e) => {
      if (this._isPanning) this._doPan(e);
      if (this._relFromEntity) this._updateRelPreview(e);
    });
    this.canvasArea.addEventListener('mouseup', (e) => {
      if (e.button === 1 || e.button === 0) this._endPan();
    });
    this.canvasArea.addEventListener('wheel', (e) => {
      e.preventDefault(); this._zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
    }, { passive: false });
  }

  _startPan(e) { this._isPanning = true; this._panStart = {x:e.clientX,y:e.clientY}; this._panOrigin = {x:this.panX,y:this.panY}; this.canvasArea.classList.add('panning'); }
  _doPan(e)    { this.panX = this._panOrigin.x+(e.clientX-this._panStart.x); this.panY = this._panOrigin.y+(e.clientY-this._panStart.y); this._applyTransform(); }
  _endPan()    { this._isPanning = false; this.canvasArea.classList.remove('panning'); }

  _zoomAt(factor, cx, cy) {
    // cx, cy son coordenadas clientX/clientY (absolutas de pantalla)
    // _screenToWorld ya descuenta r.left/r.top internamente
    const pt = this._screenToWorld(cx, cy);
    this.scale = Math.min(Math.max(this.scale * factor, 0.15), 4);
    // panX/panY deben satisfacer: cx = r.left + panX + pt.x * newScale
    // → panX = cx - r.left - pt.x * newScale
    const r = this.canvasArea.getBoundingClientRect();
    this.panX = (cx - r.left) - pt.x * this.scale;
    this.panY = (cy - r.top)  - pt.y * this.scale;
    this._applyTransform(); this._updateZoomLabel();
  }

  /**
   * Zoom con botones +/-: centra el zoom en el centro visual del contenido.
   * Si no hay entidades, usa el centro del canvas-area.
   */
  zoom(factor) {
    const r = this.canvasArea.getBoundingClientRect();

    if (this.diagram.entities.length === 0) {
      // Sin contenido: zoom en el centro del canvas (coordenadas cliente)
      this._zoomAt(factor, r.left + r.width/2, r.top + r.height/2);
      return;
    }

    // Calcular el bounding box de todas las entidades en coordenadas mundo
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.diagram.entities.forEach(e => {
      minX = Math.min(minX, e.x);          minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x + e.width); maxY = Math.max(maxY, e.y + e.height);
    });

    // Centro del diagrama en coordenadas mundo
    const worldCx = (minX + maxX) / 2;
    const worldCy = (minY + maxY) / 2;

    // Convertir a coordenadas cliente (clientX/clientY):
    // clientX = r.left + panX + worldCx * scale
    const clientCx = r.left + this.panX + worldCx * this.scale;
    const clientCy = r.top  + this.panY + worldCy * this.scale;

    this._zoomAt(factor, clientCx, clientCy);
  }
  _applyTransform() { this.diagRoot.setAttribute('transform', `translate(${this.panX},${this.panY}) scale(${this.scale})`); }
  _updateZoomLabel() { this.zoomLabel.textContent = `${Math.round(this.scale*100)}%`; }
  _screenToWorld(sx, sy) { const r = this.canvasArea.getBoundingClientRect(); return { x:(sx-r.left-this.panX)/this.scale, y:(sy-r.top-this.panY)/this.scale }; }

  // ── Teclado ───────────────────────────────────────────────────────────────
  _bindKeyboard() {
    // Atajos de guardado en fase de CAPTURA para interceptar antes que el navegador
    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          this.saveProjectAs();
        } else {
          this.saveProject();
        }
      }
    }, true); // <-- fase de captura: intercepta ANTES que el navegador

    // Resto de atajos en fase de burbuja (normal)
    document.addEventListener('keydown', (e) => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if ((e.code === 'Space' || e.key === 'h' || e.key === 'H') && !this._spaceDown) {
        if (e.code === 'Space') e.preventDefault();
        if (this.currentTool !== 'pan') {
          this._spaceDown = true;
          this._prevTool  = this.currentTool;
          this.canvasArea.classList.add('tool-pan');
          this.canvasArea.classList.remove(`tool-${this.currentTool}`);
        }
        return;
      }
      switch (e.key) {
        case 'v': case 'V': this.setTool('select'); break;
        case 'e': case 'E': this.setTool('entity'); break;
        case 'r': case 'R': this.setTool('relation'); break;
        case 'g': case 'G': this.setTool('generalization'); break;
        case 'Delete': case 'Backspace':
          if (this.selectedType === 'entity')          this.deleteEntity(this.selectedId);
          if (this.selectedType === 'relationship')    this.deleteRelationship(this.selectedId);
          if (this.selectedType === 'generalization')  this.deleteGeneralization(this.selectedId);
          break;
        case 'Escape': this.setTool('select'); this.deselect(); this._cancelRelPreview(); break;
      }
    });
    document.addEventListener('keyup', (e) => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.code === 'Space' || e.key === 'h' || e.key === 'H') {
        if (this._spaceDown) {
          this._spaceDown = false;
          this._endPan();
          this.canvasArea.classList.remove('tool-pan');
          this.canvasArea.classList.add(`tool-${this._prevTool}`);
        }
      }
    });
  }

  // ── Entidades ─────────────────────────────────────────────────────────────
  addEntity(x = 100, y = 100) {
    const entity = new Entity(`ENTIDAD_${this.diagram.entities.length + 1}`, x, y);
    this.diagram.addEntity(entity);
    const el = SVGEntityRenderer.render(entity, this);
    this.diagRoot.appendChild(el);
    this._attachEntityRelationListener(el, entity);
    const titleEl = el.querySelector('.entity-title');
    if (titleEl) setTimeout(() => this.startInlineEditTitle(entity, titleEl, el), 50);
    return entity;
  }

  deleteEntity(id) { this.diagram.removeEntity(id); this.renderAll(); this.deselect(); }

  // ── Relaciones ────────────────────────────────────────────────────────────
  startRelationFrom(entity, mouseEvent) {
    if (this._relFromEntity) {
      this._completeRelation(entity);
      return;
    }
    this._relFromEntity = entity;
    const cx = entity.x + entity.width/2, cy = entity.y + entity.height/2;
    this._relPreviewLine = svgEl('line', { class: 'rel-preview', x1: cx, y1: cy, x2: cx, y2: cy });
    this.diagRoot.appendChild(this._relPreviewLine);
    this._showHint(`Origen: ${entity.name} — ahora clic en la entidad DESTINO`);
  }

  _updateRelPreview(e) {
    if (!this._relFromEntity || !this._relPreviewLine) return;
    const world = this._screenToWorld(e.clientX, e.clientY);
    const port  = this._relFromEntity.getNearestPort(world);
    this._relPreviewLine.setAttribute('x1', port.x); this._relPreviewLine.setAttribute('y1', port.y);
    this._relPreviewLine.setAttribute('x2', world.x); this._relPreviewLine.setAttribute('y2', world.y);
  }

  _cancelRelPreview() {
    this._relFromEntity = null;
    if (this._relPreviewLine) { this._relPreviewLine.remove(); this._relPreviewLine = null; }
  }

  _completeRelation(toEntity) {
    if (!this._relFromEntity) return;
    const fromEntity = this._relFromEntity;
    this._cancelRelPreview();
    this._editingRel = null;
    this.openRelModal(fromEntity.id, toEntity.id, null);
  }

  deleteRelationship(id) { this.diagram.removeRelationship(id); this.renderAll(); this.deselect(); }

  // ── Generalización ────────────────────────────────────────────────────────

  /**
   * Flujo de creación:
   * 1. Primer clic en una entidad → se selecciona como supertipo
   * 2. Clics siguientes en otras entidades → se acumulan como subtipos
   * 3. Confirmar con el modal
   */
  _handleGenClick(entity) {
    if (!this._genSupertype) {
      // Primer clic = supertipo
      this._genSupertype = entity;
      this._showHint(`Supertipo: ${entity.name} — ahora clic en los subtipos. Clic derecho o Enter para confirmar.`);
      this._highlightGenEntity(entity.id, 'super');
    } else if (entity.id === this._genSupertype.id) {
      // Clic en supertipo de nuevo → abrir modal con lo acumulado
      this._openGenModalFromTool();
    } else if (!this._genSubtypes.find(e => e.id === entity.id)) {
      // Subtipo nuevo
      this._genSubtypes.push(entity);
      this._highlightGenEntity(entity.id, 'sub');
      this._showHint(`${this._genSubtypes.length} subtipo(s). Volvé a clicar el supertipo (${this._genSupertype.name}) para confirmar.`);
    }
  }

  _highlightGenEntity(id, role) {
    const el = this.diagRoot.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('gen-highlight-super', 'gen-highlight-sub');
    el.classList.add(role === 'super' ? 'gen-highlight-super' : 'gen-highlight-sub');
  }

  _clearGenHighlights() {
    this.diagRoot.querySelectorAll('.gen-highlight-super,.gen-highlight-sub')
      .forEach(el => el.classList.remove('gen-highlight-super','gen-highlight-sub'));
  }

  _cancelGenFlow() {
    this._genSupertype = null;
    this._genSubtypes  = [];
    this._clearGenHighlights();
  }

  _openGenModalFromTool() {
    if (!this._genSupertype || this._genSubtypes.length === 0) {
      this._showHint('Seleccioná al menos un subtipo antes de confirmar.');
      return;
    }
    this.openGenModal(null,
      this._genSupertype.id,
      this._genSubtypes.map(e => e.id)
    );
    this._cancelGenFlow();
    this.setTool('select');
  }

  openGenModal(genEdit = null, preSupertypeId = null, preSubtypeIds = []) {
    this._editingGen = genEdit;
    const modal = document.getElementById('gen-modal');
    document.getElementById('gen-modal-title').textContent =
      genEdit ? 'Editar Jerarquía' : 'Nueva Jerarquía de Generalización';
    document.getElementById('gen-modal-confirm').textContent =
      genEdit ? 'Guardar Cambios' : 'Crear Jerarquía';

    // Poblar select de supertipo
    const superSel  = document.getElementById('gen-supertype');
    superSel.innerHTML = this.diagram.entities
      .map(e => `<option value="${e.id}">${e.name}</option>`).join('');

    const supertypeId = genEdit ? genEdit.supertypeId : (preSupertypeId || '');
    if (supertypeId) superSel.value = supertypeId;

    // Poblar checkboxes de subtipos
    const subtypeIds = genEdit ? genEdit.subtypeIds : preSubtypeIds;
    this._renderGenSubtypeChecks(superSel.value, subtypeIds);

    // Restricciones
    document.getElementById('gen-disjoint').checked = genEdit ? genEdit.disjoint : false;
    document.getElementById('gen-complete').checked = genEdit ? genEdit.complete : false;

    this._updateGenPreview();
    modal.classList.remove('hidden');
  }

  _renderGenSubtypeChecks(supertypeId, selectedIds = []) {
    const container = document.getElementById('gen-subtypes-list');
    container.innerHTML = '';
    this.diagram.entities
      .filter(e => e.id !== supertypeId)
      .forEach(e => {
        const checked = selectedIds.includes(e.id);
        const lbl = document.createElement('label');
        lbl.className = 'gen-subtype-check' + (checked ? ' checked' : '');
        lbl.innerHTML = `<input type="checkbox" value="${e.id}" ${checked ? 'checked' : ''}> ${e.name}`;
        lbl.querySelector('input').addEventListener('change', () => {
          lbl.classList.toggle('checked', lbl.querySelector('input').checked);
          this._updateGenPreview();
        });
        container.appendChild(lbl);
      });
  }

  _updateGenPreview() {
    const supertypeId = document.getElementById('gen-supertype').value;
    const superEnt    = this.diagram.getEntity(supertypeId);
    const disjoint    = document.getElementById('gen-disjoint').checked;
    const complete    = document.getElementById('gen-complete').checked;
    const selectedIds = Array.from(document.querySelectorAll('#gen-subtypes-list input:checked'))
                             .map(cb => cb.value);

    document.getElementById('gen-preview-super').textContent =
      superEnt ? superEnt.name : '—';

    const label = (disjoint && complete) ? 'D,C' : disjoint ? 'D' : complete ? 'C' : '';
    document.getElementById('gen-preview-constraint').textContent = label;

    const subsEl = document.getElementById('gen-preview-subs');
    subsEl.innerHTML = selectedIds.map(id => {
      const e = this.diagram.getEntity(id);
      return e ? `<span class="gen-preview-sub-item">${e.name}</span>` : '';
    }).join('');
  }

  _bindGenModal() {
    const modal = document.getElementById('gen-modal');
    document.getElementById('gen-modal-close').addEventListener('click', () => this._closeGenModal());
    document.getElementById('gen-modal-cancel').addEventListener('click', () => this._closeGenModal());
    modal.addEventListener('click', e => { if (e.target === modal) this._closeGenModal(); });
    document.getElementById('gen-modal-confirm').addEventListener('click', () => this._confirmGenModal());

    document.getElementById('gen-supertype').addEventListener('change', () => {
      const supertypeId = document.getElementById('gen-supertype').value;
      const selected    = Array.from(document.querySelectorAll('#gen-subtypes-list input:checked')).map(cb => cb.value);
      this._renderGenSubtypeChecks(supertypeId, selected);
      this._updateGenPreview();
    });
    document.getElementById('gen-disjoint').addEventListener('change', () => this._updateGenPreview());
    document.getElementById('gen-complete').addEventListener('change', () => this._updateGenPreview());
  }

  _confirmGenModal() {
    const supertypeId = document.getElementById('gen-supertype').value;
    const subtypeIds  = Array.from(document.querySelectorAll('#gen-subtypes-list input:checked'))
                             .map(cb => cb.value);
    const disjoint    = document.getElementById('gen-disjoint').checked;
    const complete    = document.getElementById('gen-complete').checked;

    if (!supertypeId)         { alert('Seleccioná el supertipo'); return; }
    if (subtypeIds.length < 1){ alert('Seleccioná al menos un subtipo'); return; }
    if (subtypeIds.includes(supertypeId)) { alert('El supertipo no puede ser también subtipo'); return; }

    if (this._editingGen) {
      this._editingGen.supertypeId = supertypeId;
      this._editingGen.subtypeIds  = subtypeIds;
      this._editingGen.disjoint    = disjoint;
      this._editingGen.complete    = complete;
      this.renderAll();
    } else {
      const gen = new Generalization(supertypeId, subtypeIds, disjoint, complete);
      this.diagram.addGeneralization(gen);
      this._renderOneGeneralization(gen);
    }
    this._closeGenModal();
  }

  _closeGenModal() {
    document.getElementById('gen-modal').classList.add('hidden');
    this._editingGen = null;
  }

  deleteGeneralization(id) {
    this.diagram.removeGeneralization(id);
    this.renderAll();
    this.deselect();
  }


  // ── Modal de relación ─────────────────────────────────────────────────────
  _bindRelModal() {
    const modal = document.getElementById('rel-modal');
    document.getElementById('rel-modal-close').addEventListener('click',  () => this._closeRelModal());
    document.getElementById('rel-modal-cancel').addEventListener('click', () => this._closeRelModal());
    modal.addEventListener('click', (e) => { if (e.target === modal) this._closeRelModal(); });
    ['card-from-group','card-to-group'].forEach(groupId => {
      document.getElementById(groupId).addEventListener('click', (e) => {
        const btn = e.target.closest('.card-sel-btn'); if (!btn) return;
        document.getElementById(groupId).querySelectorAll('.card-sel-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected'); this._updateRelPreviewBar();
      });
    });
    document.getElementById('rel-from').addEventListener('change', () => { this._updateRelPreviewBar(); this._updateRolesSection(); });
    document.getElementById('rel-to').addEventListener('change',   () => { this._updateRelPreviewBar(); this._updateRolesSection(); });
    document.getElementById('rel-label').addEventListener('input', () => this._updateRelPreviewBar());
    document.getElementById('rel-modal-confirm').addEventListener('click', () => this._confirmRelModal());
    document.getElementById('rel-attr-add').addEventListener('click', () => {
      this._relAttrsDraft.push(new Attribute(''));
      this._renderRelAttrsList();
    });
  }

  openRelModal(fromId = null, toId = null, relEdit = null) {
    this._editingRel = relEdit;
    const modal = document.getElementById('rel-modal');
    const fromSel = document.getElementById('rel-from'), toSel = document.getElementById('rel-to');
    const labelInp = document.getElementById('rel-label');
    document.getElementById('rel-modal-title').textContent   = relEdit ? 'Editar Relación' : 'Nueva Relación';
    document.getElementById('rel-modal-confirm').textContent = relEdit ? 'Guardar Cambios' : 'Crear Relación';
    const opts = this.diagram.entities.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    fromSel.innerHTML = opts; toSel.innerHTML = opts;
    if (fromId) fromSel.value = fromId;
    if (toId)   toSel.value   = toId;
    labelInp.value = relEdit ? (relEdit.label || '') : '';
    this._setCardSelection('card-from-group', relEdit ? relEdit.cardFrom : '1');
    this._setCardSelection('card-to-group',   relEdit ? relEdit.cardTo   : '0..N');
    const idCheck = document.getElementById('rel-identifying');
    if (idCheck) idCheck.checked = relEdit ? (relEdit.identifying === true) : false;
    document.getElementById('rel-role-from').value = relEdit ? (relEdit.roleFrom || '') : '';
    document.getElementById('rel-role-to').value   = relEdit ? (relEdit.roleTo   || '') : '';

    // Clonar atributos existentes en un borrador editable (o lista vacía si es nueva)
    this._relAttrsDraft = relEdit && relEdit.attributes
      ? relEdit.attributes.map(a => Attribute.fromJSON(a.toJSON()))
      : [];
    this._renderRelAttrsList();

    this._updateRelPreviewBar();
    this._updateRolesSection();
    modal.classList.remove('hidden');
    setTimeout(() => labelInp.focus(), 80);
  }

  /** Renderiza la lista editable de atributos de relación dentro del modal */
  _renderRelAttrsList() {
    const container = document.getElementById('rel-attrs-list');
    container.innerHTML = '';
    this._relAttrsDraft.forEach((attr, i) => {
      const row = document.createElement('div');
      row.className = 'rel-attr-item';
      row.innerHTML = `
        <input type="text" class="input-field" placeholder="nombre_atributo" value="${attr.name}" />
        <button class="btn-xs del" type="button">✕</button>`;
      const input = row.querySelector('input');
      input.addEventListener('input', () => { attr.name = input.value; });
      row.querySelector('.del').addEventListener('click', () => {
        this._relAttrsDraft.splice(i, 1);
        this._renderRelAttrsList();
      });
      container.appendChild(row);
    });
  }

  _setCardSelection(groupId, value) {
    document.getElementById(groupId).querySelectorAll('.card-sel-btn')
      .forEach(b => b.classList.toggle('selected', b.dataset.value === value));
  }

  _getCardSelection(groupId) {
    const btn = document.getElementById(groupId).querySelector('.card-sel-btn.selected');
    return btn ? btn.dataset.value : '1';
  }

  _updateRelPreviewBar() {
    const fromId   = document.getElementById('rel-from').value;
    const toId     = document.getElementById('rel-to').value;
    const label    = document.getElementById('rel-label').value.trim() || '···';
    const cardFrom = this._getCardSelection('card-from-group');
    const cardTo   = this._getCardSelection('card-to-group');
    const fromEnt  = this.diagram.getEntity(fromId);
    const toEnt    = this.diagram.getEntity(toId);
    document.getElementById('rpb-from-name').textContent     = fromEnt ? fromEnt.name : '—';
    document.getElementById('rpb-to-name').textContent       = toEnt   ? toEnt.name   : '—';
    document.getElementById('rpb-from-card').textContent     = cardFrom;
    document.getElementById('rpb-to-card').textContent       = cardTo;
    document.getElementById('rpb-label-preview').textContent = label;
    document.getElementById('rpb-to-card').className         = 'rpb-card dest';
    const previewBar = document.getElementById('rel-preview-bar');
    if (previewBar) previewBar.classList.toggle('autoref', fromId === toId);
  }

  _updateRolesSection() {
    const fromId    = document.getElementById('rel-from').value;
    const toId      = document.getElementById('rel-to').value;
    const isAutoref = fromId === toId;
    const fromEnt   = this.diagram.getEntity(fromId);
    const fromLabel = document.getElementById('role-from-label');
    const toLabel   = document.getElementById('role-to-label');
    if (fromLabel) fromLabel.textContent = isAutoref ? `Rol origen (${fromEnt?.name || ''})` : 'Rol origen';
    if (toLabel)   toLabel.textContent   = isAutoref ? `Rol destino (${fromEnt?.name || ''})` : 'Rol destino';
  }

  _confirmRelModal() {
    const fromId      = document.getElementById('rel-from').value;
    const toId        = document.getElementById('rel-to').value;
    const label       = document.getElementById('rel-label').value.trim();
    const cardFrom    = this._getCardSelection('card-from-group');
    const cardTo      = this._getCardSelection('card-to-group');
    const identifying = document.getElementById('rel-identifying')?.checked === true;
    const roleFrom    = document.getElementById('rel-role-from')?.value.trim() || '';
    const roleTo      = document.getElementById('rel-role-to')?.value.trim()   || '';
    // Descartar atributos sin nombre antes de guardar
    const attributes  = (this._relAttrsDraft || []).filter(a => a.name && a.name.trim() !== '');
    if (!fromId || !toId) { alert('Selecciona las entidades'); return; }
    if (this._editingRel) {
      this._editingRel.fromId = fromId; this._editingRel.toId = toId;
      this._editingRel.cardFrom = cardFrom; this._editingRel.cardTo = cardTo;
      this._editingRel.label = label; this._editingRel.identifying = identifying;
      this._editingRel.roleFrom = roleFrom; this._editingRel.roleTo = roleTo;
      this._editingRel.attributes = attributes;
      this.renderAll();
    } else {
      const rel = new Relationship(fromId, toId, cardFrom, cardTo, label, identifying, roleFrom, roleTo, attributes);
      this.diagram.addRelationship(rel);
      this._renderOneRelationship(rel);
    }
    this._closeRelModal();
    this.currentTool = 'select'; this._updateToolUI(); this._showHint('');
  }

  _closeRelModal() {
    document.getElementById('rel-modal').classList.add('hidden');
    this._editingRel    = null;
    this._relAttrsDraft = [];
  }

  // ── Entidades débiles ─────────────────────────────────────────────────────
  _checkWeakEntities() {
    this.diagram.entities.forEach(entity => {
      const gEl = this.diagRoot.querySelector(`[data-id="${entity.id}"]`);
      if (!gEl) return;
      gEl.querySelectorAll('.entity-weak-warning').forEach(el => el.remove());
      if (!entity.isWeak) return;
      const hasIdentifying = this.diagram.relationships.some(
        r => r.identifying && (r.fromId === entity.id || r.toId === entity.id)
      );
      if (!hasIdentifying) {
        const warn = svgEl('g', { class: 'entity-weak-warning' });
        const W = entity.width;
        const tri = svgEl('path', { d: `M ${W-18} 2 L ${W-2} 2 L ${W-10} 16 Z`, fill: 'var(--warn-color)', opacity: '0.9' });
        const wt = svgEl('text', { x: W-10, y: 10, 'dominant-baseline': 'middle', 'text-anchor': 'middle', 'font-size': '8', 'font-weight': '700', fill: '#000' });
        wt.textContent = '!';
        warn.style.cursor = 'help';
        warn.addEventListener('mouseenter', (e) => SVGEntityRenderer._showWeakTooltip(e, entity, false));
        warn.addEventListener('mousemove',  SVGEntityRenderer._moveTooltip);
        warn.addEventListener('mouseleave', SVGEntityRenderer._hideTooltip);
        warn.appendChild(tri); warn.appendChild(wt);
        gEl.appendChild(warn);
      }
    });
  }

  // ── Selección ─────────────────────────────────────────────────────────────
  selectElement(type, id) {
    this.deselect(); this.selectedId = id; this.selectedType = type;
    const sel = type === 'entity'
      ? this.diagRoot.querySelector(`[data-id="${id}"]`)
      : this.diagRoot.querySelector(`[data-rel-id="${id}"]`);
    if (sel) sel.classList.add('selected');
  }

  deselect() {
    this.selectedId = null; this.selectedType = null;
    this.diagRoot.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  }

  // ── Edición inline del nombre ─────────────────────────────────────────────
  startInlineEditTitle(entity, titleEl, groupEl) {
    const bbox = titleEl.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text'; input.value = entity.name; input.className = 'svg-inline-input';
    input.style.left = bbox.left + 'px'; input.style.top = (bbox.top - 4) + 'px';
    input.style.width = (entity.width * this.scale) + 'px'; input.style.textAlign = 'center';
    document.body.appendChild(input); input.focus(); input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;   // evitar doble ejecución blur + Enter
      committed = true;
      entity.name = input.value.trim().toUpperCase() || entity.name;
      if (input.parentNode) input.remove();
      const old = this.diagRoot.querySelector(`[data-id="${entity.id}"]`);
      if (old) {
        const neu = SVGEntityRenderer.render(entity, this);
        this._attachEntityRelationListener(neu, entity);
        this.diagRoot.replaceChild(neu, old);
      }
      this.updateRelationships();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { committed = true; if (input.parentNode) input.remove(); }
    });
  }

  // ── Editor de atributos ───────────────────────────────────────────────────
  openAttrEditor(entity, attr, groupEl) {
    document.querySelectorAll('.attr-popover').forEach(el => el.remove());
    const isNew = !attr;
    if (isNew) attr = new Attribute('', false, false, false, '', '');

    const TYPE_GROUPS = [
      { label: 'Numérico',    types: ['Byte','Integer','LongInteger','Serial','Decimal','Number','Money','ShortFloat','Float','LongFloat'] },
      { label: 'Texto',       types: ['Char','NChar','Varchar','NVarchar'] },
      { label: 'Fecha y hora',types: ['Date','Time','DateTime','Timestamp'] },
      { label: 'Otros',       types: ['Text','Binary','Boolean'] },
    ];
    const NEEDS_LENGTH = ['Varchar','NVarchar','Char','NChar','Binary'];

    const pop = document.createElement('div');
    pop.className = 'attr-popover attr-popover-lg';
    const rect = groupEl.getBoundingClientRect();
    pop.style.left = (rect.right + 8) + 'px';
    pop.style.top  = rect.top + 'px';

    const typeRadios = TYPE_GROUPS.map(grp => `
      <div class="ap-type-group">
        <span class="ap-type-group-label">${grp.label}</span>
        <div class="ap-type-radios">
          ${grp.types.map(t => `
            <label class="ap-type-radio ${attr.dataType===t?'selected':''}">
              <input type="radio" name="ap-type" value="${t}" ${attr.dataType===t?'checked':''}> ${t}
            </label>`).join('')}
        </div>
      </div>`).join('');

    pop.innerHTML = `
      <h4>${isNew ? 'Nuevo Atributo' : 'Editar Atributo'}</h4>
      <div class="ap-section-label">Nombre</div>
      <div class="attr-popover-row">
        <input type="text" id="ap-name" placeholder="nombre_atributo" value="${attr.name}" />
      </div>
      <div class="ap-section-label">Tipo de dato</div>
      <div class="ap-type-length-row">
        <div class="ap-type-length-col">
          <label class="ap-meta-label">Tipo</label>
          <input type="text" id="ap-type-display" class="ap-type-display" placeholder="ninguno" value="${attr.dataType}" readonly />
        </div>
        <div class="ap-type-length-col ap-length-col" id="ap-length-col"
          style="display:${NEEDS_LENGTH.includes(attr.dataType)?'flex':'none'}">
          <label class="ap-meta-label">Longitud</label>
          <input type="number" id="ap-length" class="ap-length-input" min="1" max="65535"
            placeholder="ej: 50" value="${attr.length}" />
        </div>
        <button class="btn-xs ap-clear-type" id="ap-clear-type" title="Quitar tipo">✕</button>
      </div>
      <div class="ap-type-selector" id="ap-type-selector">${typeRadios}</div>
      <div class="ap-section-label">Restricciones</div>
      <div class="attr-popover-flags">
        <label class="flag-checkbox"><input type="checkbox" id="ap-pk" ${attr.pk?'checked':''}> PK</label>
        <label class="flag-checkbox"><input type="checkbox" id="ap-fk" ${attr.fk?'checked':''}> FK</label>
        <label class="flag-checkbox"><input type="checkbox" id="ap-nn" ${attr.nn?'checked':''}> NN</label>
        <label class="flag-checkbox"><input type="checkbox" id="ap-uq" ${attr.unique?'checked':''}> UQ</label>
      </div>
      <div class="attr-popover-actions">
        ${!isNew ? '<button class="btn-xs del" id="ap-del">Eliminar</button>' : ''}
        <button class="btn-xs" id="ap-cancel">Cancelar</button>
        <button class="btn-xs primary" id="ap-save">${isNew ? 'Agregar' : 'Guardar'}</button>
      </div>`;

    document.body.appendChild(pop);
    pop.querySelector('#ap-name').focus();

    pop.querySelectorAll('input[name="ap-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        pop.querySelector('#ap-type-display').value = radio.value;
        pop.querySelectorAll('.ap-type-radio').forEach(l => l.classList.remove('selected'));
        radio.closest('.ap-type-radio').classList.add('selected');
        pop.querySelector('#ap-length-col').style.display = NEEDS_LENGTH.includes(radio.value) ? 'flex' : 'none';
      });
    });

    pop.querySelector('#ap-clear-type').addEventListener('click', () => {
      pop.querySelectorAll('input[name="ap-type"]').forEach(r => r.checked = false);
      pop.querySelectorAll('.ap-type-radio').forEach(l => l.classList.remove('selected'));
      pop.querySelector('#ap-type-display').value = '';
      pop.querySelector('#ap-length-col').style.display = 'none';
    });

    pop.querySelector('#ap-cancel').addEventListener('click', () => pop.remove());
    if (!isNew) pop.querySelector('#ap-del').addEventListener('click', () => {
      entity.removeAttribute(attr.id); this._refreshEntity(entity); pop.remove();
    });

    pop.querySelector('#ap-save').addEventListener('click', () => {
      const name = pop.querySelector('#ap-name').value.trim();
      if (!name) { pop.querySelector('#ap-name').focus(); return; }
      attr.name     = name;
      attr.pk       = pop.querySelector('#ap-pk').checked;
      attr.fk       = pop.querySelector('#ap-fk').checked;
      attr.nn       = pop.querySelector('#ap-nn').checked;
      attr.unique   = pop.querySelector('#ap-uq').checked;
      attr.dataType = pop.querySelector('#ap-type-display').value;
      attr.length   = NEEDS_LENGTH.includes(attr.dataType) ? (pop.querySelector('#ap-length').value || '') : '';
      if (isNew) entity.addAttribute(attr);
      this._refreshEntity(entity); pop.remove();
    });

    pop.querySelector('#ap-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') pop.querySelector('#ap-save').click();
      if (e.key === 'Escape') pop.remove();
    });

    setTimeout(() => {
      const dismiss = (e) => { if (!pop.contains(e.target)){pop.remove();document.removeEventListener('mousedown',dismiss);} };
      document.addEventListener('mousedown', dismiss);
    }, 100);

    requestAnimationFrame(() => {
      const pr = pop.getBoundingClientRect();
      if (pr.right  > window.innerWidth)  pop.style.left = (rect.left - pr.width - 8) + 'px';
      if (pr.bottom > window.innerHeight) pop.style.top  = (window.innerHeight - pr.height - 10) + 'px';
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  _refreshEntity(entity) {
    const old = this.diagRoot.querySelector(`[data-id="${entity.id}"]`);
    if (old) {
      const neu = SVGEntityRenderer.render(entity, this);
      this._attachEntityRelationListener(neu, entity);
      this.diagRoot.replaceChild(neu, old);
    }
    this.updateRelationships();
  }

  renderAll() {
    while (this.diagRoot.firstChild) this.diagRoot.removeChild(this.diagRoot.firstChild);
    const portMap = this._computeOffsetPorts();
    this.diagram.generalizations.forEach(gen => this._renderOneGeneralization(gen));
    this.diagram.relationships.forEach(rel => this._renderOneRelationship(rel, portMap));
    this.diagram.entities.forEach(entity => {
      const el = SVGEntityRenderer.render(entity, this);
      this._attachEntityRelationListener(el, entity);
      this.diagRoot.appendChild(el);
    });
    this._checkWeakEntities();
  }

  _renderOneRelationship(rel, portMap = null) {
    const from = this.diagram.getEntity(rel.fromId), to = this.diagram.getEntity(rel.toId);
    if (!from || !to) return;
    const ports = portMap?.get(rel.id) || {};
    const el = SVGRelationRenderer.render(rel, from, to, this, ports.fromPort || null, ports.toPort || null);
    const firstEntity = this.diagRoot.querySelector('.entity-group');
    if (firstEntity) this.diagRoot.insertBefore(el, firstEntity);
    else             this.diagRoot.appendChild(el);
  }
  _renderOneGeneralization(gen) {
    const el = SVGGeneralizationRenderer.render(gen, this.diagram, this);
    // Insertar antes de las entidades
    const firstEntity = this.diagRoot.querySelector('.entity-group');
    if (firstEntity) this.diagRoot.insertBefore(el, firstEntity);
    else             this.diagRoot.appendChild(el);
  }


  updateRelationships() {
    // Calcular ports con offset para evitar superposición
    const portMap = this._computeOffsetPorts();

    this.diagram.relationships.forEach(rel => {
      const g    = this.diagRoot.querySelector(`[data-rel-id="${rel.id}"]`);
      const from = this.diagram.getEntity(rel.fromId);
      const to   = this.diagram.getEntity(rel.toId);
      if (!g || !from || !to) return;
      const ports = portMap.get(rel.id) || {};
      SVGRelationRenderer.update(g, rel, from, to, ports.fromPort || null, ports.toPort || null);
    });
    // Actualizar también las jerarquías al mover entidades
    this.diagram.generalizations.forEach(gen => {
      const g = this.diagRoot.querySelector(`[data-gen-id="${gen.id}"]`);
      if (g) SVGGeneralizationRenderer.update(g, gen, this.diagram);
    });
  }

  /**
   * Calcula los puntos de conexión de todas las relaciones con offset,
   * distribuyendo uniformemente las relaciones que comparten el mismo
   * lado de una entidad para evitar superposiciones.
   *
   * Retorna un Map<relId, { fromPort, toPort }>
   */
  _computeOffsetPorts() {
    const result = new Map();
    const sideGroups = new Map();

    // Detectar entidades con autoreferencia.
    // El lazo ocupa la esquina inferior-derecha (80% de bottom, 80% de right).
    // Las relaciones normales deben evitar esa zona de esquina.
    const selfRefEntities = new Set(
      this.diagram.relationships
        .filter(r => r.fromId === r.toId)
        .map(r => r.fromId)
    );

    this.diagram.relationships.forEach(rel => {
      if (rel.fromId === rel.toId) return;

      const from = this.diagram.getEntity(rel.fromId);
      const to   = this.diagram.getEntity(rel.toId);
      if (!from || !to) return;

      const fromCenter = { x: from.x + from.width/2,  y: from.y + from.height/2 };
      const toCenter   = { x: to.x   + to.width/2,    y: to.y   + to.height/2   };

      // Para entidades con lazo: preferir top y left (opuestos a la esquina del lazo).
      // Si la geometría fuerza usar bottom o right, el sistema de distribución
      // ya se encargará de separar los puntos del área de la esquina.
      const fromPort = selfRefEntities.has(rel.fromId)
        ? from.getNearestPortExcluding(toCenter, ['bottom', 'right'])
        : from.getNearestPort(toCenter);
      const toPort = selfRefEntities.has(rel.toId)
        ? to.getNearestPortExcluding(fromCenter, ['bottom', 'right'])
        : to.getNearestPort(fromCenter);

      const fKey = `${rel.fromId}-${fromPort.side}`;
      const tKey = `${rel.toId}-${toPort.side}`;
      if (!sideGroups.has(fKey)) sideGroups.set(fKey, []);
      if (!sideGroups.has(tKey)) sideGroups.set(tKey, []);
      sideGroups.get(fKey).push({ relId: rel.id, role: 'from', basePort: fromPort, entity: from, otherCenter: toCenter });
      sideGroups.get(tKey).push({ relId: rel.id, role: 'to',   basePort: toPort,   entity: to,   otherCenter: fromCenter });
    });

    sideGroups.forEach((entries) => {
      if (entries.length <= 1) return;

      const entity = entries[0].entity;
      const side   = entries[0].basePort.side;

      const sortKey = (side === 'left' || side === 'right')
        ? e => e.otherCenter.y
        : e => e.otherCenter.x;

      entries.sort((a, b) => sortKey(a) - sortKey(b));

      // Para entidades con lazo, el margen en bottom/right debe evitar
      // el 80% final (donde está anclado el lazo) → usamos hasta 70% del lado
      const hasSelfRef = selfRefEntities.has(entity.id);
      entries.forEach((entry, i) => {
        const port = SVGRelationRenderer._distributedPort(
          entity, side, i, entries.length, hasSelfRef && (side === 'bottom' || side === 'right')
        );
        if (!result.has(entry.relId)) result.set(entry.relId, {});
        const rec = result.get(entry.relId);
        if (entry.role === 'from') rec.fromPort = port;
        else                       rec.toPort   = port;
      });
    });

    return result;
  }

  _attachEntityRelationListener(el, entity) {
    el.removeEventListener('mousedown', el._relListener);
    el._relListener = (e) => {
      if (this.currentTool === 'relation' && this._relFromEntity) {
        e.stopPropagation(); this._completeRelation(entity);
      } else if (this.currentTool === 'generalization') {
        e.stopPropagation(); this._handleGenClick(entity);
      }
    };
    el.addEventListener('mousedown', el._relListener);
  }

  // ── Vista ─────────────────────────────────────────────────────────────────
  fitView() {
    if (!this.diagram.entities.length) return;
    const pad = 60; let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    this.diagram.entities.forEach(e => { minX=Math.min(minX,e.x); minY=Math.min(minY,e.y); maxX=Math.max(maxX,e.x+e.width); maxY=Math.max(maxY,e.y+e.height); });
    const cW=maxX-minX+pad*2, cH=maxY-minY+pad*2, r=this.canvasArea.getBoundingClientRect();
    this.scale = Math.max(Math.min(r.width/cW, r.height/cH, 1.5), 0.15);
    this.panX  = (r.width -cW*this.scale)/2-(minX-pad)*this.scale;
    this.panY  = (r.height-cH*this.scale)/2-(minY-pad)*this.scale;
    this._applyTransform(); this._updateZoomLabel();
  }

  // ── Guardar / Cargar / Exportar ───────────────────────────────────────────
  newDiagram() {
    if (this.diagram.entities.length > 0 && !confirm('¿Crear un nuevo diagrama? Se perderán los cambios no guardados.')) return;
    this.diagram = new Diagram();
    this._fileHandle   = null;
    this._lastFilename = null;
    this._updateFilenameIndicator();
    this.deselect(); this.renderAll();
  }

  // ── Gestión de archivos ───────────────────────────────────────────────────
  //
  // Si el navegador soporta File System Access API (Chrome/Edge):
  //   · Abrir  → showOpenFilePicker → guarda el FileHandle
  //   · Guardar → escribe en el mismo FileHandle (sobrescribe el archivo)
  //   · Guardar como → showSaveFilePicker → nuevo FileHandle
  //
  // Si no soporta (Firefox/Safari/GitHub Pages sin permisos):
  //   · Fallback a <input type=file> y descarga con <a download>

  /** Detecta soporte real de File System Access API */
  get _hasFileAPI() {
    return typeof window.showOpenFilePicker === 'function';
  }

  /** Actualiza el indicador de nombre de archivo en la topbar */
  _updateFilenameIndicator() {
    const el = document.getElementById('topbar-filename');
    if (!el) return;
    if (this._fileHandle) {
      el.textContent = '📄 ' + this._fileHandle.name;
      el.title = this._fileHandle.name;
      el.classList.add('has-file');
    } else if (this._lastFilename) {
      el.textContent = this._lastFilename + '.json';
      el.title = 'Sin archivo abierto — Guardar descargará una copia';
      el.classList.remove('has-file');
    } else {
      el.textContent = '';
      el.classList.remove('has-file');
    }
  }

  /** Abre un archivo JSON usando el diálogo nativo o <input type=file> */
  async openProject() {
    if (this._hasFileAPI) {
      let handles;
      try {
        handles = await window.showOpenFilePicker({
          types: [{ description: 'Diagrama TGD-ER', accept: { 'application/json': ['.json'] } }],
          multiple: false,
        });
      } catch (e) {
        if (e.name === 'AbortError') return;
        throw e;
      }
      const handle = handles[0];
      const file   = await handle.getFile();
      const text   = await file.text();
      try {
        this.diagram = Diagram.fromJSON(JSON.parse(text));
        this._fileHandle   = handle;
        this._lastFilename = handle.name.replace(/\.json$/i, '');
        this.renderAll(); this.fitView();
        this._updateFilenameIndicator();
      } catch (err) {
        alert('Error al cargar: ' + err.message);
      }
    } else {
      // Fallback: usar el <input type=file> oculto
      document.getElementById('file-input').click();
    }
  }

  /**
   * Guardar — sobrescribe el archivo abierto si hay FileHandle,
   * de lo contrario actúa como "Guardar como".
   */
  async saveProject() {
    const json = JSON.stringify(this.diagram.toJSON(), null, 2);

    if (this._hasFileAPI && this._fileHandle) {
      // Sobrescribir el archivo abierto directamente
      try {
        const writable = await this._fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        this._updateFilenameIndicator();
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        // Si pierde el permiso, ofrecer "Guardar como"
        console.warn('No se pudo sobrescribir, intentando Guardar como:', e);
      }
    }

    // Sin FileHandle: usar "Guardar como"
    await this.saveProjectAs();
  }

  /** Guardar como — siempre pide nombre/ubicación nueva */
  async saveProjectAs() {
    const json = JSON.stringify(this.diagram.toJSON(), null, 2);

    if (this._hasFileAPI) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: (this._lastFilename || 'diagrama-er') + '.json',
          types: [{ description: 'Diagrama TGD-ER', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        this._fileHandle   = handle;
        this._lastFilename = handle.name.replace(/\.json$/i, '');
        this._updateFilenameIndicator();
      } catch (e) {
        if (e.name === 'AbortError') return;
        // Fallback si el picker falla
        this._fallbackDownload(json);
      }
    } else {
      this._fallbackDownload(json);
    }
  }

  /** Descarga clásica con prompt de nombre (fallback para Firefox/Safari) */
  _fallbackDownload(json) {
    const suggested = this._lastFilename || 'diagrama-er';
    const input = window.prompt('Nombre del archivo (sin extensión):', suggested);
    if (input === null) return;
    const filename = (input.trim() || suggested) + '.json';
    this._lastFilename = input.trim() || suggested;
    this._updateFilenameIndicator();
    this._download(json, filename, 'application/json');
  }

  exportJSON() { this.saveProjectAs(); }

  loadProject(file) {
    // Usado por el <input type=file> fallback
    this._fileHandle   = null; // sin handle en fallback
    this._lastFilename = file.name.replace(/\.json$/i, '');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        this.diagram = Diagram.fromJSON(JSON.parse(e.target.result));
        this.renderAll(); this.fitView();
        this._updateFilenameIndicator();
      } catch(err) { alert('Error al cargar: ' + err.message); }
    };
    reader.readAsText(file);
  }

  exportPNG() {
    if (!this.diagram.entities.length) { alert('No hay entidades para exportar'); return; }

    // Leer la paleta activa desde las variables CSS computadas, para que
    // la exportación respete el tema actual (claro u oscuro) en lugar de
    // usar colores fijos. weakBadgeFg y gridDot se derivan con valores
    // específicos por tema porque no tienen variable CSS propia.
    const cs = getComputedStyle(document.body);
    const v  = (name) => cs.getPropertyValue(name).trim();
    const isLight = document.body.classList.contains('theme-light');

    const C = {
      bg: v('--bg'), entityBg: v('--entity-bg'), entityHead: v('--entity-head'),
      entityBorder: v('--entity-border'), entityWeak: isLight ? '#7c5cea' : '#7c6adb',
      sep: v('--border'), fg: v('--fg'), fgMuted: v('--fg-muted'), fgSubtle: v('--fg-subtle'),
      accent: v('--accent'), accent2: v('--accent2'), accentDim: v('--accent-dim'), accent2Dim: v('--accent2-dim'),
      pkColor: v('--pk-color'), pkBg: v('--pk-bg'), fkColor: v('--accent2'), fkBg: v('--accent2-dim'),
      weakBadgeBg: v('--accent2-dim'), weakBadgeFg: isLight ? '#5b3fc4' : '#c4b5fd',
      gridDot: isLight ? '#dde1ea' : '#1a2030',
    };
    const FONT = "'JetBrains Mono', 'Courier New', monospace";

    const pad = 60;
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    this.diagram.entities.forEach(e => { minX=Math.min(minX,e.x); minY=Math.min(minY,e.y); maxX=Math.max(maxX,e.x+e.width); maxY=Math.max(maxY,e.y+e.height); });
    const W = maxX-minX+pad*2, H = maxY-minY+pad*2, SC = 2;

    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs={}, txt='') => {
      const e = document.createElementNS(NS, tag);
      for (const [k,v] of Object.entries(attrs)) e.setAttribute(k,v);
      if (txt) e.textContent = txt;
      return e;
    };

    const svg = el('svg', { xmlns:NS, width:W*SC, height:H*SC, viewBox:`0 0 ${W*SC} ${H*SC}` });
    svg.appendChild(el('rect', { width:'100%', height:'100%', fill:C.bg }));
    const defs = el('defs');
    const pat  = el('pattern', { id:'exp-grid', x:0, y:0, width:24*SC, height:24*SC, patternUnits:'userSpaceOnUse' });
    pat.appendChild(el('circle', { cx:1, cy:1, r:1, fill:C.gridDot }));
    defs.appendChild(pat);
    svg.appendChild(defs);
    svg.appendChild(el('rect', { width:'100%', height:'100%', fill:'url(#exp-grid)', opacity:'0.6' }));

    const root = el('g', { transform:`translate(${(pad-minX)*SC},${(pad-minY)*SC}) scale(${SC})` });

    this.diagram.relationships.forEach(rel => {
      const fromEnt = this.diagram.getEntity(rel.fromId), toEnt = this.diagram.getEntity(rel.toId);
      if (!fromEnt || !toEnt) return;
      const fromC = { x:fromEnt.x+fromEnt.width/2, y:fromEnt.y+fromEnt.height/2 };
      const toC   = { x:toEnt.x+toEnt.width/2,     y:toEnt.y+toEnt.height/2     };
      const fp = fromEnt.getNearestPort(toC), tp = toEnt.getNearestPort(fromC);
      const lineAttrs = { x1:fp.x, y1:fp.y, x2:tp.x, y2:tp.y, stroke:C.accent, 'stroke-width':'1.8', fill:'none', opacity:'0.9' };
      if (!rel.identifying) lineAttrs['stroke-dasharray'] = '8 4';
      root.appendChild(el('line', lineAttrs));
      const drawCF = (type, port, anchor, color) => {
        const angle=Math.atan2(port.y-anchor.y,port.x-anchor.x), dx=Math.cos(angle), dy=Math.sin(angle);
        const TICK=7,CB=12,BAR=26,CIR=28;
        const iw=d=>({x:port.x-dx*d,y:port.y-dy*d});
        const mkL=(x1,y1,x2,y2)=>root.appendChild(el('line',{x1,y1,x2,y2,stroke:color,'stroke-width':'1.8','stroke-linecap':'round'}));
        const mkC=(cx,cy,r)=>root.appendChild(el('circle',{cx,cy,r,fill:'none',stroke:color,'stroke-width':'1.8'}));
        const perp=(o,h)=>({x1:o.x+(-dy)*h,y1:o.y+dx*h,x2:o.x-(-dy)*h,y2:o.y-dx*h});
        if(type==='one'){const p1=perp(iw(BAR-12),TICK);mkL(p1.x1,p1.y1,p1.x2,p1.y2);const p2=perp(iw(BAR),TICK);mkL(p2.x1,p2.y1,p2.x2,p2.y2);}
        else if(type==='zero_one'){const pp=perp(iw(BAR-12),TICK);mkL(pp.x1,pp.y1,pp.x2,pp.y2);const cp=iw(CIR);mkC(cp.x,cp.y,5);}
        else if(type==='one_many'){const tip=iw(CB);mkL(port.x,port.y,tip.x,tip.y);mkL(port.x+(-dy)*TICK,port.y+dx*TICK,tip.x,tip.y);mkL(port.x-(-dy)*TICK,port.y-dx*TICK,tip.x,tip.y);const pp=perp(iw(BAR),TICK);mkL(pp.x1,pp.y1,pp.x2,pp.y2);}
        else if(type==='zero_many'){const tip=iw(CB);mkL(port.x,port.y,tip.x,tip.y);mkL(port.x+(-dy)*TICK,port.y+dx*TICK,tip.x,tip.y);mkL(port.x-(-dy)*TICK,port.y-dx*TICK,tip.x,tip.y);const cp=iw(CIR);mkC(cp.x,cp.y,5);}
      };
      drawCF(Relationship.cardToType(rel.cardFrom),fp,tp,C.accent);
      drawCF(Relationship.cardToType(rel.cardTo),tp,fp,C.accent2);
      if(rel.label){const mx=(fp.x+tp.x)/2,my=(fp.y+tp.y)/2;root.appendChild(el('rect',{x:mx-34,y:my-8,width:68,height:14,rx:3,fill:C.entityBg,opacity:'0.95'}));root.appendChild(el('text',{x:mx,y:my,'dominant-baseline':'middle','text-anchor':'middle','font-family':FONT,'font-size':'9.5',fill:C.fgMuted},rel.label));}
    });

    this.diagram.entities.forEach(entity => {
      const {x,y,width:W2,height:H2,headerH:HH,attrH:AH,footerH:FH}=entity;
      root.appendChild(el('rect',{x:x+3,y:y+4,width:W2,height:H2,rx:8,fill:'#000',opacity:'0.35'}));
      const borderColor=entity.isWeak?C.entityWeak:C.entityBorder;
      root.appendChild(el('rect',{x,y,width:W2,height:H2,rx:8,fill:C.entityBg,stroke:borderColor,'stroke-width':'1.5'}));
      if(entity.isWeak){const M=4;root.appendChild(el('rect',{x:x+M,y:y+M,width:W2-M*2,height:H2-M*2,rx:5,fill:'none',stroke:C.entityWeak,'stroke-width':'1.2'}));}
      root.appendChild(el('rect',{x,y,width:W2,height:HH,rx:8,fill:C.entityHead}));
      root.appendChild(el('rect',{x,y:y+HH/2,width:W2,height:HH/2,fill:C.entityHead}));
      root.appendChild(el('text',{x:x+W2/2,y:y+HH/2,'dominant-baseline':'middle','text-anchor':'middle','font-family':FONT,'font-size':'13','font-weight':'600',fill:C.fg},entity.name));
      if(entity.isWeak){root.appendChild(el('rect',{x:x+W2-43,y:y+5,width:36,height:13,rx:3,fill:C.weakBadgeBg,stroke:C.entityWeak,'stroke-width':'1'}));root.appendChild(el('text',{x:x+W2-25,y:y+11,'dominant-baseline':'middle','text-anchor':'middle','font-family':FONT,'font-size':'8','font-weight':'700',fill:C.weakBadgeFg},'WEAK'));}
      root.appendChild(el('line',{x1:x,y1:y+HH,x2:x+W2,y2:y+HH,stroke:C.sep,'stroke-width':'1'}));
      entity.attributes.forEach((attr,i)=>{
        const ay=y+HH+i*AH;
        if(i>0)root.appendChild(el('line',{x1:x+8,y1:ay,x2:x+W2-8,y2:ay,stroke:C.sep,'stroke-width':'0.5'}));
        let xOff=x+10;
        if(attr.pk){root.appendChild(el('rect',{x:xOff-1,y:ay+AH/2-7,width:22,height:13,rx:3,fill:C.pkBg}));root.appendChild(el('text',{x:xOff+10,y:ay+AH/2,'dominant-baseline':'middle','text-anchor':'middle','font-family':FONT,'font-size':'9','font-weight':'700',fill:C.pkColor},'PK'));xOff+=26;}
        if(attr.fk){root.appendChild(el('rect',{x:xOff-1,y:ay+AH/2-7,width:22,height:13,rx:3,fill:C.fkBg}));root.appendChild(el('text',{x:xOff+10,y:ay+AH/2,'dominant-baseline':'middle','text-anchor':'middle','font-family':FONT,'font-size':'9','font-weight':'700',fill:C.fkColor},'FK'));xOff+=26;}
        const nameColor=attr.pk?C.pkColor:(attr.fk?C.fkColor:C.fg);
        root.appendChild(el('text',{x:xOff,y:ay+AH/2,'dominant-baseline':'middle','font-family':FONT,'font-size':'11.5',fill:nameColor},attr.name+(attr.nn?' *':'')));
        if(attr.typeLabel)root.appendChild(el('text',{x:x+W2-8,y:ay+AH/2,'dominant-baseline':'middle','text-anchor':'end','font-family':FONT,'font-size':'10',fill:C.fgSubtle},attr.typeLabel));
      });
      const footY=y+HH+entity.attributes.length*AH;
      root.appendChild(el('text',{x:x+W2/2,y:footY+FH/2,'dominant-baseline':'middle','text-anchor':'middle','font-family':FONT,'font-size':'10',fill:C.fgSubtle,opacity:'0.5'},'+ Agregar atributo'));
    });

    svg.appendChild(root);
    const svgStr=new XMLSerializer().serializeToString(svg);
    const blob=new Blob([svgStr],{type:'image/svg+xml;charset=utf-8'});
    const url=URL.createObjectURL(blob), img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');
      canvas.width=W*SC; canvas.height=H*SC;
      canvas.getContext('2d').drawImage(img,0,0);
      URL.revokeObjectURL(url);
      canvas.toBlob(png=>this._download(URL.createObjectURL(png),'erflow-diagram.png',null,true),'image/png');
    };
    img.onerror=()=>{URL.revokeObjectURL(url);alert('Error al generar PNG');};
    img.src=url;
  }

  _download(content, filename, type, isUrl=false) {
    const a = document.createElement('a');
    a.href = isUrl ? content : `data:${type};charset=utf-8,${encodeURIComponent(content)}`;
    a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}