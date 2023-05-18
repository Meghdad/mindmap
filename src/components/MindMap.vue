<template>
  <div ref="mindmap" id="mindmap" :style="mmStyle">
    <svg ref="svg" tabindex="0" :class="svgClass">
      <g ref="content" id="content" ></g>
      <rect v-show="showSelectedBox" id="selectedBox" ref='selectedBox' :width='seleBox.width' :height='seleBox.height'
        :transform="`translate(${seleBox.x},${seleBox.y})`"
      ></rect>
    </svg>
    <div ref="dummy" id="dummy"></div>
    <div ref="menu"
      id="menu"
      tabindex="0"
      v-show="showContextMenu"
      :style="{ top: contextMenuY+'px', left: contextMenuX+'px' }"
      @blur="showContextMenu = false"
    >
      <div
        :class="`menu-item ${item.disabled ? 'disabled' : ''}`"
        v-for="(item, index) in contextMenuItems"
        :key="index"
        @click="item.disabled ? null : clickMenu(item.name)"
      >
        <div>{{ item.title }}</div>
      </div>
    </div>
    <div class="buttonList right-bottom">
      <button v-show="gps" class="icon" ref="gps" type="button" @click="makeCenter()">
        <i class="gps"></i>
      </button>
      <button v-show="fitView" class="icon" ref="fitView" type="button" @click="fitContent()">
        <i class="fitView"></i>
      </button>
      <button v-show="download" class="icon" ref="download" type="button" @click="showPopUps=true">
        <i class="download"></i>
      </button>
    </div>
    <div class="buttonList top-right">
      <button v-show="showUndo" class="icon" :class="{disabled: !canUndo}" ref="undo"
        type="button" @click="undo()"
      >
        <i class="undo"></i>
      </button>
      <button v-show="showUndo" class="icon" :class="{disabled: !canRedo}" ref="redo"
        type="button" @click="redo()"
      >
        <i class="redo"></i>
      </button>
    </div>
    <div class="pop-ups" v-show="showPopUps">
      <div class="layer"></div>
      <div class="content">
        <div class="exportTo">
          <div class="optionList">
            <div
              :class="`option ${index===selectedOption ? 'select' : ''} ${opt.disabled ? 'disabled' : ''}`"
              v-for="(opt, index) in optionList"
              :key="index"
              @click="opt.disabled ? '' : selectedOption=index"
            >
              <div :class="`icon ${opt.color}`">
                <i :class="opt.icon"></i>
              </div>
              <div class="text">{{ opt.title }}</div>
            </div>
          </div>
          <div class="optionTip">{{ optionTip }}</div>
          <div class="action">
            <div class="spacer"></div>
            <button class="cancel" @click="showPopUps=false">Cancel</button>
            <button @click="exportTo(); showPopUps=false">Export</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop, Model } from 'vue-property-decorator'
import * as d3 from '../ts/d3'
import { flextree } from 'd3-flextree'
import ImData from '../ts/ImData'
import History from '../ts/History'
import toMarkdown from '../ts/toMarkdown'

let mmdata: ImData // mind map data
@Component
export default class MindMap extends Vue {
  @Prop() width: number | undefined
  @Prop() height: number | undefined
  @Prop({ default: 50 }) xSpacing!: number
  @Prop({ default: 20 }) ySpacing!: number
  @Prop({ default: true }) draggable!: boolean
  @Prop({ default: true }) gps!: boolean
  @Prop({ default: true }) fitView!: boolean
  @Prop({ default: true }) download!: boolean
  @Prop({ default: true }) keyboard!: boolean
  @Prop({ default: true }) showNodeAdd!: boolean
  @Prop({ default: true }) contextMenu!: boolean
  @Prop({ default: true }) zoomable!: boolean
  @Prop({ default: true }) showUndo!: boolean
  @Prop({ default: 4 }) strokeWidth!: number
  @Model('change', { required: true }) value!: Array<Data>

  @Watch('keyboard')
  onKeyboardChanged(val: boolean) { this.makeKeyboard(val) }
  @Watch('showNodeAdd')
  onShowNodeAddChanged(val: boolean) { this.makeNodeAdd(val) }
  @Watch('draggable')
  onDraggableChanged(val: boolean) { this.makeDrag(val) }
  @Watch('contextMenu')
  onContextMenuChanged(val: boolean) { this.makeContextMenu(val) }
  @Watch('xSpacing')
  onXSpacingChanged() {
    mmdata.resize()
    this.updateMmdata()
    this.updateMindmap()
  }
  @Watch('ySpacing')
  onYSpacingChanged() { this.updateMindmap() }
  @Watch('zoomable')
  onZoomableChanged(val: boolean) { this.makeZoom(val) }

  $refs!: {
    mindmap: HTMLDivElement
    svg: Element
    content: Element
    dummy: HTMLDivElement
    menu: HTMLDivElement
    selectedBox: SVGRectElement
  }

  dragFlag = false
  multiSeleFlag = false
  minTextWidth = 16
  minTextHeight = 21
  gBtnSide = 24 // gBtn side length
  foreignBorderWidth = 3
  spaceKey = false
  toRecord = true // Determine whether to record the data snapshot of mmdata
  toUpdate = true // Determine whether to update mmdata
  dTop!: FlexNode // The data with the highest vertical coordinate in mmdata
  root!: FlexNode // mmdata containing location information
  showContextMenu = false
  showPopUps = false
  showSelectedBox = false // check box
  contextMenuX = 0
  contextMenuY = 0
  mouse = { x0: 0, y0: 0, x1: 0, y1: 0 }
  contextMenuTarget!: Mdata | Mdata[]
  contextMenuItems = [
    { title: 'Delete', name: 'delete', disabled: false },
    { title: 'Collapse', name: 'collapse', disabled: false },
    { title: 'Expand', name: 'expand', disabled: false },
  ]
  optionList = [
    { title: 'JSON', icon: 'code-json', tip: 'Create a text file in JSON format', color: 'purpleOpt' },
    { title: 'Image', icon: 'image', tip: 'Create an image file in PNG format', color: 'greenOpt', disabled: true },
    { title: 'Markdown', icon: 'markdown', tip: 'Create a text file in Markdown format', color: 'grassOpt' },
  ]
  selectedOption = 0
  mindmapSvg!: d3.Selection<Element, FlexNode, null, undefined>
  mindmapG!: d3.Selection<Element, FlexNode, null, undefined>
  dummy!: d3.Selection<HTMLDivElement, FlexNode, null, undefined>
  mindmapSvgZoom!: d3.ZoomBehavior<Element, FlexNode>
  easePolyInOut = d3.transition().duration(1000).ease(d3.easePolyInOut)
  link = d3.linkHorizontal().x((d) => d[0]).y((d) => d[1])
  zoom = d3.zoom() as d3.ZoomBehavior<Element, FlexNode>
  history = new History()

  get mmStyle() {
    return {
      width: this.width ? `${this.width}px` : '100%',
      height: this.height ? `${this.height}px` : '',
    }
  }
  get svgClass() { return `stroke-width-${this.strokeWidth} ${this.spaceKey && this.zoomable ? 'grab' : ''}` }
  get optionTip() { return this.optionList[this.selectedOption].tip }
  get canUndo() { return this.history.canUndo }
  get canRedo() { return this.history.canRedo }
  get seleBox() {
    const { x0, x1, y0, y1 } = this.mouse
    const x = Math.min(x0, x1)
    const y = Math.min(y0, y1)
    const width = Math.abs(x0 - x1)
    const height = Math.abs(y0 - y1)
    return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height }
  }

  getViewPos(p?: DOMRect) {
    const svgPos = this.$refs.svg.getBoundingClientRect()
    const { pageX, pageY } = d3.event
    const viewLeft = svgPos.left + window.pageXOffset
    const viewTop = svgPos.top + window.pageYOffset
    const { left, top, right, bottom } = p || { left: pageX, top: pageY, right: pageX, bottom: pageY }
    return {
      left: left - viewLeft,
      top: top - viewTop,
      right: right - viewLeft,
      bottom: bottom - viewTop,
    }
  }
  updateMmdata(val?: Mdata | null) { // immutable data
    if (val) { mmdata.data = JSON.parse(JSON.stringify(val)) }
    if (this.toRecord) {
      this.history.record(JSON.parse(JSON.stringify(mmdata.data)))
    }
    this.updateMindmap()
    this.toUpdate = false
    this.$emit('change', [mmdata.getSource()])
  }
  init() {
    // bind element
    this.mindmapSvg = d3.select(this.$refs.svg)
    this.mindmapG = d3.select(this.$refs.content)
    this.mindmapG.style('opacity', 0)
    this.dummy = d3.select(this.$refs.dummy)
    // bind svg event
    this.makeKeyboard(this.keyboard)
    this.mindmapSvg.on('contextmenu', () => { d3.event.preventDefault() })
    this.mindmapSvgZoom = this.zoom.on('zoom', () => { this.mindmapG.attr('transform', d3.event.transform) })
      .filter(() => (
        (d3.event.ctrlKey && d3.event.type !== 'mousedown')
        || (this.spaceKey && d3.event.type !== 'wheel')
      ) && !d3.event.button) // Enable two-finger pinch, spacebar + left button to drag
      .scaleExtent([0.1, 8]) // Zoom factor: 0.1～8
    this.makeZoom(this.zoomable)
  }
  initNodeEvent() { // Binding node events
    this.makeDrag(this.draggable)
    this.makeNodeAdd(this.showNodeAdd)
    this.makeContextMenu(this.contextMenu)
  }
  // event
  makeKeyboard(val: boolean) {
    val ? this.mindmapSvg.on('keydown', this.svgKeyDown).on('keyup', this.svgKeyUp)
      : this.mindmapSvg.on('keydown', null).on('keyup', null)
  }
  makeNodeAdd(val: boolean) {
    const fObject = this.mindmapG.selectAll('foreignObject') as d3.Selection<Element, FlexNode, Element, FlexNode>
    const gBtn = this.mindmapG.selectAll('.gButton') as d3.Selection<Element, FlexNode, Element, FlexNode>
    if (val) {
      const { mouseLeave, mouseEnter, gBtnClick } = this
      fObject.on('mouseenter', mouseEnter).on('mouseleave', mouseLeave)
      gBtn.on('mouseenter', mouseEnter).on('mouseleave', mouseLeave).on('mousedown', gBtnClick)
    } else {
      fObject.on('mouseenter', null).on('mouseleave', null)
      gBtn.on('mouseenter', null).on('mouseleave', null).on('mousedown', null)
    }
  }
  makeContextMenu(val: boolean) {
    const selection = this.mindmapG.selectAll('foreignObject') as d3.Selection<Element, FlexNode, Element, FlexNode>
    if (val) {
      selection.on('contextmenu', this.fObjectRightClick)
    } else {
      selection.on('contextmenu', null)
    }
  }
  makeDrag(val: boolean) {
    const { mindmapG, dragged, fObjMousedown, dragended } = this
    const selection = mindmapG.selectAll('foreignObject') as d3.Selection<Element, FlexNode, Element, FlexNode>
    const drag = d3.drag().container((d, i, n) => n[i].parentNode?.parentNode as d3.DragContainerElement) as d3.DragBehavior<Element, FlexNode, FlexNode>
    if (val) {
      selection.call(drag.on('start', fObjMousedown).on('drag', dragged).on('end', dragended))
    } else {
      selection.call(drag.on('start', null).on('drag', null).on('end', null))
    }
  }
  makeZoom(val: boolean) {
    const { mindmapSvg, mindmapSvgZoom, zoom } = this
    if (val) {
      mindmapSvg.call(mindmapSvgZoom).on('dblclick.zoom', null)
        .on('wheel.zoom', () => {
          const { ctrlKey, deltaY, deltaX, x, y } = d3.event
          d3.event.preventDefault()
          const current = d3.zoomTransform(this.$refs.svg)
          if (ctrlKey) { // zoom
            const svgPos = this.$refs.svg.getBoundingClientRect()
            const px = svgPos.left + window.pageXOffset
            const py = svgPos.top + window.pageYOffset
            const k = current.k - deltaY * 0.02
            zoom.scaleTo(mindmapSvg, k, [x - px, y - py])
          } else { // move
            zoom.translateBy(mindmapSvg, -deltaX, -deltaY)
          }
        })
    } else {
      mindmapSvg.on('.zoom', null)
    }
  }
  // button event
  undo() {
    if (this.canUndo) {
      this.toRecord = false
      this.updateMmdata(this.history.undo())
    }
  }
  redo() {
    if (this.canRedo) {
      this.toRecord = false
      this.updateMmdata(this.history.redo())
    }
  }
  downloadFile(content: string, filename: string) {
    const eleLink = document.createElement('a')
    eleLink.download = filename
    eleLink.style.display = 'none'
    // Character content is converted into a blob address
    const blob = new Blob([content])
    eleLink.href = URL.createObjectURL(blob)
    // trigger click
    document.body.appendChild(eleLink)
    eleLink.click()
    // then remove
    document.body.removeChild(eleLink)
  }
  exportTo() { // export to
    const data = mmdata.getSource()
    let content = ''
    let filename = data.name
    switch (this.selectedOption) {
      case 0: // JSON
        content = JSON.stringify(data, null, 2)
        filename += '.json'
        break
      case 2: // Markdown
        content = toMarkdown(data)
        filename += '.md'
        break
      default:
        break
    }
    this.downloadFile(content, filename)
  }
  async makeCenter() { // in the center
    await d3.transition().end().then(() => {
      this.mindmapSvg.call(this.zoom.translateTo, 0, 0)
    })
  }
  async fitContent() { // fit window size
    await d3.transition().end().then(() => {
      const rect = (this.$refs.content as SVGGElement).getBBox()
      const div = this.$refs.mindmap
      const multipleX = div.offsetWidth / rect.width
      const multipleY = div.offsetHeight / rect.height
      const multiple = Math.min(multipleX, multipleY)

      this.mindmapSvg.transition(this.easePolyInOut as any).call(this.zoom.scaleTo, multiple)
    })
  }
  // data manipulation
  add(dParent: Mdata, d: Data) {
    this.toRecord = true
    const nd = mmdata.add(dParent.id, d)
    this.updateMmdata()
    return nd
  }
  insert(dPosition: Mdata, d: Data, i = 0) {
    this.toRecord = true
    const nd = mmdata.insert(dPosition.id, d, i)
    this.updateMmdata()
    return nd
  }
  move(del: Mdata, insert?: Mdata, i = 0) {
    this.toRecord = true
    mmdata.move(del.id, insert?.id, i)
    this.updateMmdata()
  }
  reparent(p: Mdata, d: Mdata) {
    this.toRecord = true
    mmdata.reparent(p.id, d.id)
    this.updateMmdata()
  }
  del(s: Mdata | Mdata[]) {
    this.toRecord = true
    if (Array.isArray(s)) {
      const idArr = []
      for (let i = 0; i < s.length; i++) {
        idArr.push(s[i].id)
      }
      mmdata.del(idArr)
    } else {
      mmdata.del(s.id)
    }
    this.updateMmdata()
  }
  updateName(d: Mdata, name: string) {
    if (d.name !== name) { // have changed
      this.toRecord = true
      const nd = mmdata.rename(d.id, name)
      this.updateMmdata()
      return nd
    }
  }
  collapse(s: Mdata | Mdata[]) {
    this.toRecord = true
    if (Array.isArray(s)) {
      const idArr = []
      for (let i = 0; i < s.length; i++) {
        idArr.push(s[i].id)
      }
      mmdata.collapse(idArr)
    } else {
      mmdata.collapse(s.id)
    }
    this.updateMmdata()
  }
  expand(s: Mdata | Mdata[]) {
    this.toRecord = true
    if (Array.isArray(s)) {
      const idArr = []
      for (let i = 0; i < s.length; i++) {
        idArr.push(s[i].id)
      }
      mmdata.expand(idArr)
    } else {
      mmdata.expand(s.id)
    }
    this.updateMmdata()
  }
  // keyboard
  svgKeyDown() {
    const event = d3.event
    const keyName = event.key as string
    // Operations on maps
    if (keyName === ' ' && !this.spaceKey) { this.spaceKey = true }
    if (event.metaKey) {
      if (keyName === 'z') { // revoke
        d3.event.preventDefault()
        this.undo()
      } else if (keyName === 'y') { // redo
        d3.event.preventDefault()
        this.redo()
      }
    } else { // Operations on Nodes
      const sele = d3.select('#selectedNode') as d3.Selection<Element, FlexNode, Element, FlexNode>
      const seleNode = sele.node()
      if (seleNode) {
        const seleData = sele.data()[0]
        const seleDepth = seleData.depth
        const im = seleData.data
        const pNode = seleNode.parentNode as Element

        switch (keyName) {
          case 'Tab': {
            d3.event.preventDefault()
            const nd = this.add(im, { name: '' })
            if (nd) {
              this.editNew(nd, seleDepth + 1, pNode)
            }
            break
          }
          case 'Enter': {
            d3.event.preventDefault()
            if (pNode === this.$refs.content) { // When entering the root node, it is equivalent to tab
              const nd = this.add(im, { name: '' })
              if (nd) {
                this.editNew(nd, seleDepth + 1, pNode)
              }
            } else {
              const nd = this.insert(im, { name: '' }, 1)
              if (nd) {
                this.editNew(nd, seleDepth, pNode)
              }
            }
            break
          }
          case 'Backspace': {
            d3.event.preventDefault()
            this.del(im)
            break
          }
          default:
            break
        }
      }
    }
  }
  svgKeyUp() { // Operations on maps
    if (d3.event.key === ' ') { this.spaceKey = false }
  }
  divKeyDown() {
    if (d3.event.key === 'Enter') {
      // d3.event.preventDefault()
      // document.execCommand('insertHTML', false, '<br>')
    }
  }
  // node operation
  updateNodeName() { // When text editing is complete
    const editP = document.querySelector('#editing > foreignObject > div') as HTMLDivElement
    window.getSelection()?.removeAllRanges() // clear check
    const editText = editP.innerText || ''
    this.mindmapG.select('g#editing').each((d, i, n) => {
      (n[i] as Element).removeAttribute('id')
      const nd = this.updateName(d.data, editText)
      if (nd) {
        this.$emit('updateNodeName', mmdata.getSource(nd.id), nd.id)
      }
    })
    editP.setAttribute('contenteditable', 'false')
  }
  removeSelectedId() { // Clear selected nodes
    const sele = document.getElementById('selectedNode')
    if (sele) {
      sele.setAttribute('__click__', '0')
      sele.removeAttribute('id')
    }
  }
  selectNode(n: Element) { // selected node
    this.removeMultiSelected()
    if (n.getAttribute('id') !== 'selectedNode') {
      this.removeSelectedId()
      n.setAttribute('id', 'selectedNode')
    }
  }
  editNode(n: Element) { // edit node
    this.removeSelectedId()
    n.setAttribute('id', 'editing')
    const fObj = d3.select(n).selectAll('foreignObject').filter((a, b, c) => (c[b] as Element).parentNode === n) as d3.Selection<Element, FlexNode, Element, FlexNode>
    this.focusNode(fObj)
    fObj.select('div').attr('contenteditable', true)
    const fdiv = document.querySelector('#editing > foreignObject > div')
    if (fdiv) {
      window.getSelection()?.selectAllChildren(fdiv)
    }
  }
  focusNode(fObj: d3.Selection<Element, FlexNode, Element | null, FlexNode | undefined>) { // make the node visible
    const { k } = d3.zoomTransform(this.$refs.svg) // Zoom in and out
    const fObjPos = (fObj.node() as Element).getBoundingClientRect()
    if (fObjPos) {
      const svgPos = this.$refs.svg.getBoundingClientRect()

      const r = fObjPos.right - svgPos.right
      const b = fObjPos.bottom - svgPos.bottom
      const l = fObjPos.left - svgPos.left
      const t = fObjPos.top - svgPos.top
      const x = (r > 0 && r) || (l < 0 && l)
      const y = (b > 0 && b) || (t < 0 && t)

      // keep node visible
      if (x) { this.mindmapSvg.call(this.zoom.translateBy, -x / k, 0) }
      if (y) { this.mindmapSvg.call(this.zoom.translateBy, 0, -y / k) }
    }
  }
  editNew(newD: Mdata, depth: number, pNode: Element) { // Focus on new nodes
    d3.transition().end().then(() => {
      const node = d3.select(pNode).selectAll(`g.node.depth_${depth}`)
        .filter((b) => (b as FlexNode).data.id === newD.id)
        .node()

      this.editNode(node as Element)
    }, (err) => {
      console.log(err)
    })
  }
  fdivMouseDown() {
    const flag = d3.event.target.getAttribute('contenteditable')
    if (flag === 'true') {
      d3.event.stopPropagation() // Prevent triggering drag, click
    }
  }
  fObjMousedown(d: FlexNode, i: number, n: ArrayLike<Element>) {
    const edit = document.getElementById('editing')
    let flag = 0
    const clickedNode = n[i].parentNode as Element
    if (edit && edit !== clickedNode) {
      const f = (
        d3.selectAll('foreignObject').filter((d, i, n) => (n[i] as Element).parentNode === edit).node() as Element
      ).firstElementChild as HTMLElement

      f.blur()
      flag = 1
    }
    if (!edit || flag) { // not editing
      this.selectNode(clickedNode)
    }
  }
  fObjectClick(d: FlexNode, i: number, n: ArrayLike<Element>) { // Double click to enter edit state
    const sele = document.getElementById('selectedNode')
    const { dragFlag } = this
    if (sele) {
      if (sele.getAttribute('__click__') === '1'
      && n[i].parentNode === sele
      && document.activeElement !== n[i].firstElementChild
      && !dragFlag) {
        this.editNode(sele)
        sele.setAttribute('__click__', '0')
      } else {
        sele.setAttribute('__click__', '1')
        if (!dragFlag) {
          this.$emit('click', mmdata.getSource(d.data.id), d.data.id)
        }
      }
    }
  }
  fObjectRightClick(d: FlexNode, i: number, n: ArrayLike<Element>) {
    const sele = document.getElementById('selectedNode')
    const edit = document.getElementById('editing')
    const clickedNode = n[i].parentNode as Element
    const show = () => { // Show context menu
      const pos = this.getViewPos()
      this.contextMenuX = pos.left
      this.contextMenuY = pos.top
      this.showContextMenu = true
      this.clearSelection()
      setTimeout(() => { this.$refs.menu.focus() }, 300)
    }
    if (clickedNode.classList.contains('multiSelectedNode')) {
      const t: Mdata[] = []
      ;(this.mindmapG.selectAll('g.multiSelectedNode') as d3.Selection<Element, FlexNode, Element, FlexNode>)
        .each((d, i, n) => { t.push(d.data) })
      const collapseFlag = t.filter((d) => d.children && d.children.length > 0).length > 0
      const expandFlag = t.filter((d) => d._children && d._children.length > 0).length > 0
      this.contextMenuItems[1].disabled = !collapseFlag
      this.contextMenuItems[2].disabled = !expandFlag
      this.contextMenuTarget = t
      show()
    } else if (clickedNode !== edit) { // not editing
      if (clickedNode !== sele) { // selected
        this.selectNode(clickedNode)
      }
      const { data } = d
      this.contextMenuItems[1].disabled = !(data.children && data.children.length > 0)
      this.contextMenuItems[2].disabled = !(data._children && data._children.length > 0)
      this.contextMenuTarget = data
      show()
    }
  }
  gBtnClick(a: FlexNode, i: number, n: ArrayLike<Element>) { // add child node
    if ((n[i] as SVGElement).style.opacity === '1') {
      d3.event.stopPropagation()
      const d: FlexNode = d3.select(n[i].parentNode as Element).data()[0] as FlexNode
      const newD = this.add(d.data, { name: '' })
      this.mouseLeave(d, i, n)
      if (newD) {
        this.editNew(newD, d.depth + 1, n[i].parentNode as Element)
      }
    }
  }
  clickMenu(key: string) {
    this.showContextMenu = false
    const { contextMenuTarget } = this
    switch (key) {
      case 'delete':
        this.del(contextMenuTarget)
        break
      case 'collapse':
        this.collapse(contextMenuTarget)
        break
      case 'expand':
        this.expand(contextMenuTarget)
        break
      default:
        break
    }
    (this.$refs.svg as HTMLElement).focus()
    this.removeSelectedId()
  }
  // suspension event
  mouseLeave(d: FlexNode, i: number, n: ArrayLike<Element>) {
    if ((n[i] as SVGElement).className.baseVal.includes('gButton')) {
      d3.select(n[i]).style('opacity', 0)
    } else {
      d3.selectAll('g.gButton').filter((a, b, c) => (c[b] as Element).parentNode === n[i].parentNode).style('opacity', 0)
    }
  }
  mouseEnter(d: FlexNode, i: number, n: ArrayLike<Element>) {
    const flag = (d.data._children?.length || 0) > 0
    if (!flag) {
      if ((n[i] as SVGElement).className.baseVal.includes('gButton')) {
        d3.select(n[i]).style('opacity', 1)
      } else {
        d3.selectAll('g.gButton').filter((a, b, c) => (c[b] as Element).parentNode === n[i].parentNode).style('opacity', 0.5)
      }
    }
  }
  // drag and drop
  draggedNodeRenew(draggedNode: Element, px: number, py: number, dura = 0, d: FlexNode) {
    const { path, renewOffset } = this
    renewOffset(d, px, py)
    const targetY = d.dy + py // x-axis coordinate
    const targetX = d.dx + px // y-axis coordinate
    const tran = d3.transition().duration(dura).ease(d3.easePoly)

    d3.select(draggedNode).transition(tran as any).attr('transform', `translate(${targetY},${targetX})`)
    // Update the draggedNode and the path of the parent node
    d3.select(`path#path_${d.data.id}`).transition(tran as any).attr('d', (d) => path(d as FlexNode))
  }
  renewOffset(d: FlexNode, px: number, py: number) { // update offset
    d.px = px
    d.py = py
    if (d.children) {
      for (let index = 0; index < d.children.length; index += 1) {
        const dChild = d.children[index]
        this.renewOffset(dChild, px, py)
      }
    }
  }
  dragged(a: FlexNode, i: number, n: ArrayLike<Element>) { // Dragging [to be perfected]
    this.dragFlag = true
    if (a.depth !== 0) {
      const { mindmapG, xSpacing, foreignX, foreignY } = this
      const draggedNode = n[i].parentNode as Element
      // Drag and drop, offset relative to the original position of a
      this.draggedNodeRenew(draggedNode, d3.event.y - a.y, d3.event.x - a.x, undefined, a)
      // Mouse coordinates (relative to this.$refs.content)
      const t = d3.mouse(this.$refs.content as SVGGElement)
      const targetY = t[0] // x-axis coordinate
      const targetX = t[1] // y-axis coordinate

      // Calculate the coordinates of others
      ;(mindmapG.selectAll('g.node') as d3.Selection<Element, FlexNode, Element, FlexNode>)
        .filter((d, i, n) => draggedNode !== n[i] && draggedNode.parentNode !== n[i])
        .each((d, i, n) => {
          const gNode = n[i]
          const rect = { // The coordinates of other gRect, and the width and height of gRect
            y: foreignX(d) + d.y, // The x-axis offset of foreignObject
            x: foreignY(d) + d.x, // The y-axis offset of foreignObject
            width: d.size[1] - xSpacing,
            height: d.size[0],
          }
          // Overlap trigger rectangle border
          if ((targetY > rect.y) && (targetY < rect.y + rect.width)
          && (targetX > rect.x) && (targetX < rect.x + rect.height)) {
            gNode.setAttribute('id', 'newParentNode')
          } else if (gNode.getAttribute('id') === 'newParentNode') {
            gNode.removeAttribute('id')
          }
        })
    }
  }
  dragback(d: FlexNode, draggedNode: Element) {
    this.draggedNodeRenew(draggedNode, 0, 0, 1000, d)
  }
  dragended(d: FlexNode, i: number, n: ArrayLike<Element>) {
    const { dragback, reparent, fObjectClick } = this
    const draggedNode = n[i].parentNode as Element
    const newParentNode = document.getElementById('newParentNode')
    if (newParentNode) { // Create a new parent-child relationship
      newParentNode.removeAttribute('id')
      const newParentD = d3.select(newParentNode).data()[0] as FlexNode
      reparent(newParentD.data, d.data)
    } else {
      const LR = (d.data.id.split('-').length === 2) && ((d.y > 0 && d.y + d.py < 0) || (d.y < 0 && d.y + d.py > 0)) // Left and right node transformation
      const flag = LR ? (a: FlexNode) => a.data.left !== d.data.left : (a: FlexNode) => a.data.left === d.data.left
      const draggedParentNode = d3.select(draggedNode.parentNode as Element)
      const draggedBrotherNodes = (draggedParentNode.selectAll(`g.depth_${d.depth}`) as d3.Selection<Element, FlexNode, Element, FlexNode>)
        .filter((a, i, n) => draggedNode !== n[i] && flag(a))
      if (!draggedBrotherNodes.nodes()[0]) { // When there is no sibling node
        if (LR) {
          this.move(d.data)
        } else {
          dragback(d, draggedNode)
          fObjectClick(d, i, n)
        }
      } else {
        const a: { x0: number, x1: number, b1?: Mdata, n1?: Element, b0?: Mdata, n0?: Element } = { x0: Infinity, x1: -Infinity }
        draggedBrotherNodes.each((b, i, n) => {
          if (((b.x > d.x) || LR) && b.x > a.x1 && b.x < (d.x + d.px)) { // Find the new brother node
            a.x1 = b.x
            a.b1 = b.data
            a.n1 = n[i]
          }
          if (((b.x < d.x) || LR) && b.x < a.x0 && b.x > (d.x + d.px)) { // Find a new sibling node
            a.x0 = b.x
            a.b0 = b.data
            a.n0 = n[i]
          }
        })
        if (a.b0 || a.b1) { // Swap the order of nodes when there are new sibling nodes
          const sdata = d.data
          if (a.b0 && a.n0) { // insert before sibling node
            this.move(sdata, a.b0)
            draggedNode.parentNode?.insertBefore(draggedNode, a.n0)
          } else if (a.b1 && a.n1) { // Insert after sibling node
            this.move(sdata, a.b1, 1)
            draggedNode.parentNode?.insertBefore(draggedNode, a.n1.nextSibling)
          }
        } else {
          dragback(d, draggedNode)
          fObjectClick(d, i, n)
        }
      }
    }
    this.dragFlag = false
  }
  // multiple choice
  removeMultiSelected() {
    (this.mindmapG.selectAll('g.multiSelectedNode') as d3.Selection<Element, FlexNode, Element, FlexNode>)
      .each((d, i, n) => { n[i].classList.remove('multiSelectedNode') })
  }
  multiSelectStart() { // start multiple selection
    this.removeSelectedId()

    if (d3.event.button === 0) { // left button
      this.removeMultiSelected()
      this.multiSeleFlag = true
      const { mouse, getViewPos } = this
      const vp = getViewPos()
      mouse.x0 = vp.left
      mouse.y0 = vp.top
    }
  }
  multiSelect() { // Multiple selection
    if (this.multiSeleFlag) {
      this.showSelectedBox = true
      d3.event.preventDefault()
      const { mouse, getViewPos } = this
      const vp = getViewPos()
      mouse.x1 = vp.left
      mouse.y1 = vp.top

      const { mindmapG, seleBox } = this
      ;(mindmapG.selectAll('foreignObject') as d3.Selection<Element, FlexNode, Element, FlexNode>)
        .each((d, i, n) => {
          const f = n[i]
          const g = (f.parentNode as Element)
          const pos = getViewPos(f.getBoundingClientRect())
          const flag = pos.left < seleBox.right && pos.bottom > seleBox.top && pos.right > seleBox.left && pos.top < seleBox.bottom
          if (flag) {
            g.classList.add('multiSelectedNode')
          } else {
            g.classList.remove('multiSelectedNode')
          }
        })
    }
  }
  multiSelectEnd() { // end multiple choice
    this.multiSeleFlag = false
    this.showSelectedBox = false
    const { mouse } = this
    mouse.x0 = mouse.x1 = mouse.y0 = mouse.y1 = 0
  }
  // draw
  updateMindmap() {
    this.tree()
    this.getDTop()
    this.draw()
    this.initNodeEvent()
  }
  dKey(d: FlexNode) { return d.data.gKey }
  gClass(d: FlexNode) { return `depth_${d.depth} node` }
  gTransform(d: FlexNode) { return `translate(${d.dy},${d.dx})` }
  foreignX(d: FlexNode) {
    const { xSpacing, foreignBorderWidth } = this
    return -foreignBorderWidth + (d.data.id !== '0' ? (d.data.left ? -d.size[1] + xSpacing : 0) : -(d.size[1] - xSpacing * 2) / 2)
  }
  foreignY(d: FlexNode) { return -this.foreignBorderWidth + (d.data.id !== '0' ? -d.size[0] : -d.size[0] / 2) }
  gBtnTransform(d: FlexNode) {
    const { xSpacing, gBtnSide } = this
    let x = d.data.id === '0' ? (d.size[1] - xSpacing * 2) / 2 + 8 : d.size[1] - xSpacing + 8
    if (d.data.left) {
      x = -x - gBtnSide
    }
    return `translate(${x},${-gBtnSide / 2})`
  }
  gBtnVisible(d: FlexNode) { return ((d.data._children?.length || 0) <= 0) ? 'visible' : 'hidden' }
  gEllTransform(d: FlexNode) {
    const { xSpacing } = this
    let x = d.data.id === '0' ? (d.size[1] - xSpacing * 2) / 2 + 6 : d.size[1] - xSpacing + 6
    if (d.data.left) {
      x = -x - 16
    }
    return `translate(${x},${0})`
  }
  gEllVisible(d: FlexNode) { return (d.data._children?.length || 0) > 0 ? 'visible' : 'hidden' }
  pathId(d: FlexNode) { return `path_${d.data.id}` }
  pathClass(d: FlexNode) { return `depth_${d.depth}` }
  pathColor(d: FlexNode) { return d.data.color || 'white' }
  path(d: FlexNode) {
    const { xSpacing, link } = this
    const temp = (d.parent && d.parent.data.id === '0') ? -d.dy : (d.data.left ? xSpacing : -xSpacing)
    const sourceX = temp - d.py
    const sourceY = 0 - d.dx - d.px
    let textWidth = d.size[1] - xSpacing
    if (d.data.left) {
      textWidth = -textWidth
    }

    return `${link({ source: [sourceX, sourceY], target: [0, 0] })}L${textWidth},${0}`
  }
  nest(d: FlexNode, i: number, n: ArrayLike<Element>) {
    const { dKey, appendNode, updateNode, exitNode } = this
    const dd = d.children || [];
    (d3.select(n[i]).selectAll(`g${dd[0] ? `.depth_${dd[0].depth}.node` : ''}`) as d3.Selection<Element, FlexNode, Element, FlexNode>)
      .data(dd, dKey)
      .join(appendNode, updateNode, exitNode)
  }
  appendNode(enter: d3.Selection<d3.EnterElement, FlexNode, Element, FlexNode>) {
    const { expand, gEllTransform, gClass, gTransform, updateNodeName, divKeyDown, foreignY, gBtnTransform, pathId, pathClass, pathColor, path, nest, fdivMouseDown, foreignX, gBtnSide, gBtnVisible, gEllVisible } = this
    const gNode = enter.append('g').attr('class', gClass).attr('transform', gTransform)

    const foreign = gNode.append('foreignObject').attr('x', foreignX).attr('y', foreignY)
    const foreignDiv = foreign.append('xhtml:div').attr('contenteditable', false).text((d: FlexNode) => d.data.name)
    foreignDiv.on('blur', updateNodeName).on('keydown', divKeyDown).on('mousedown', fdivMouseDown)
    foreignDiv.each((d, i, n) => {
      const observer = new ResizeObserver((l) => {
        const t = l[0].target
        const b1 = getComputedStyle(t).borderTopWidth
        const b2 = getComputedStyle(t.parentNode as Element).borderTopWidth
        const spacing = (parseInt(b1, 10) + parseInt(b2, 10)) || 0
        foreign.filter((d: FlexNode, index: number) => i === index)
          .attr('width', l[0].contentRect.width + spacing * 2)// div and foreign border
          .attr('height', l[0].contentRect.height + spacing * 2)
      })
      observer.observe(n[i] as Element)
    })

    const gBtn = gNode.append('g').attr('class', 'gButton').attr('transform', gBtnTransform).style('visibility', gBtnVisible)
    gBtn.append('rect').attr('width', gBtnSide).attr('height', gBtnSide).attr('rx', 3).attr('ry', 3)
    gBtn.append('path').attr('d', 'M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z')

    const ell = gNode.append('g').attr('class', 'gEllipsis').attr('transform', gEllTransform).style('visibility', gEllVisible)
      .classed('show', (d: FlexNode) => (d.data._children?.length || 0) > 0)
      .on('click', (d: FlexNode) => expand(d.data))
    ell.append('rect').attr('x', -2).attr('y', -6).attr('width', 20).attr('height', 14).style('opacity', 0)
    ell.append('rect').attr('x', 0).attr('y', -2).attr('width', 16).attr('height', 4).attr('rx', 2).attr('ry', 2).attr('class', 'btn')
      .attr('stroke', pathColor).attr('fill', pathColor)
    ell.append('circle').attr('cx', 4).attr('cy', 0).attr('r', 1)
    ell.append('circle').attr('cx', 8).attr('cy', 0).attr('r', 1)
    ell.append('circle').attr('cx', 12).attr('cy', 0).attr('r', 1)

    const enterData = enter.data()
    if (enterData.length) {
      if (enterData[0].data.id !== '0') {
        gNode.append('path').attr('id', pathId).attr('class', pathClass).lower().attr('stroke', pathColor)
          .attr('d', path)
      }
      gNode.each(nest)
    }

    gBtn.raise()
    foreign.raise()
    return gNode
  }
  updateNode(update: d3.Selection<Element, FlexNode, Element, FlexNode>) {
    const { gEllTransform, gClass, gTransform, easePolyInOut, foreignY, gBtnTransform, pathId, pathClass, pathColor, path, nest, foreignX } = this
    update.interrupt().selectAll('*').interrupt()
    update.attr('class', gClass).transition(easePolyInOut as any).attr('transform', gTransform)

    update.each((d, k, m) => {
      const node = d3.select(m[k]) as d3.Selection<Element, FlexNode, null, undefined>
      const foreign = node.selectAll('foreignObject').filter((d, i, n) => (n[i] as Element).parentNode === m[k])
        .data([d]) // must rebind the children using selection.data to give them the new data.
        .attr('x', foreignX)
        .attr('y', foreignY)

      foreign.select('div').text(d.data.name)
      node.select('path').filter((d, i, n) => (n[i] as Element).parentNode === m[k]).attr('id', pathId(d))
        .attr('class', pathClass(d))
        .attr('stroke', pathColor(d))
        .transition(easePolyInOut as any)
        .attr('d', path(d))

      node.each(nest)

      const ellFlag = (d.data._children?.length || 0) > 0

      node.selectAll('g.gButton').filter((d, i, n) => (n[i] as Element).parentNode === m[k]).data([d])
        .attr('transform', gBtnTransform)
        .style('visibility', !ellFlag ? 'visible' : 'hidden')
        .raise()

      const ell = node.selectAll('g.gEllipsis').filter((d, i, n) => (n[i] as Element).parentNode === m[k]).data([d])
        .attr('transform', gEllTransform)
        .classed('show', ellFlag)
        .style('visibility', ellFlag ? 'visible' : 'hidden')
      ell.select('rect.btn').attr('stroke', pathColor).attr('fill', pathColor)

      foreign.raise()
    })
    return update
  }
  exitNode(exit: d3.Selection<Element, FlexNode, Element, FlexNode>) {
    exit.filter((d, i, n) => n[i].classList[1] === 'node').remove()
  }
  draw() { // generate svg
    const { dKey, mindmapG, appendNode, updateNode, exitNode } = this
    const d = [this.root]

    ;(mindmapG.selectAll(`g${d[0] ? `.depth_${d[0].depth}.node` : ''}`) as d3.Selection<Element, FlexNode, Element, FlexNode>)
      .data(d, dKey)
      .join(appendNode, updateNode, exitNode)
  }
  tree() { // data processing
    const { ySpacing } = this
    const layout = flextree({ spacing: ySpacing })
    const yGap = mmdata.data.size[1] / 2
    // left
    const tl = layout.hierarchy(mmdata.data, (d: Mdata) => d.id.split('-').length === 1 ? d.children?.filter(d => d.left) : d.children)
    layout(tl)
    tl.each((a: FlexNode) => { if (a.data.id !== '0') { a.y = -a.y + yGap } })
    // right
    const tr = layout.hierarchy(mmdata.data, (d: Mdata) => d.id.split('-').length === 1 ? d.children?.filter(d => !d.left) : d.children)
    layout(tr)
    tr.each((a: FlexNode) => { if (a.data.id !== '0') { a.y = a.y - yGap } }) // Move a fixed distance in the same direction
    // all
    tr.children = tl.children
      ? (tr.children ? tr.children.concat(tl.children) : tl.children)
      : tr.children
    tr.each((a: FlexNode) => { // x vertical axis y horizontal axis dx dy relative offset
      if (a.data.id !== '0') {
        a.x += a.size[0] / 2
      }
      a.dx = a.x - (a.parent ? a.parent.x : 0)
      a.dy = a.y - (a.parent ? a.parent.y : 0)
      a.px = 0
      a.py = 0
    })
    this.root = tr
  }
  getDTop() {
    let t = this.root
    while (t.children) { t = t.children[0] }
    this.dTop = t
  }
  getSize(text: string, root = false) {
    const { dummy, xSpacing, minTextWidth, minTextHeight } = this
    let textWidth = 0
    let textHeight = 0
    dummy.selectAll('.dummyText').data([text]).enter().append('div').text((d) => d)
      .each((d, i, n) => {
        textWidth = n[i].offsetWidth
        textHeight = n[i].offsetHeight
        n[i].remove() // remove them just after displaying them
      })
    textWidth = Math.max(minTextWidth, textWidth)
    textHeight = Math.max(minTextHeight, textHeight)
    return [textHeight, textWidth + (root ? xSpacing * 2 : xSpacing)]
  }
  clearSelection() { // Clear the selected word triggered by right click
    if (window.getSelection) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
    }
  }
  addWatch() {
    this.$watch('value', (newVal) => {
      if (this.toUpdate) {
        mmdata = new ImData(newVal[0], this.getSize)
        this.updateMmdata()
      } else {
        this.toUpdate = true
      }
    }, { immediate: true, deep: true })
  }
  async mounted() {
    this.init()
    this.mindmapSvg.on('mousedown', this.multiSelectStart)
    this.mindmapSvg.on('mousemove', this.multiSelect)
    this.mindmapSvg.on('mouseup', this.multiSelectEnd)
    this.addWatch()
    await this.makeCenter()
    await this.fitContent()
    this.mindmapG.style('opacity', 1)
  }
}
</script>

<style lang="scss">
  @import '../css/MindMap.scss'
</style>
