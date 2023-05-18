import * as d3ScaleChromatic from 'd3-scale-chromatic'
import * as d3Scale from 'd3-scale'

const colorScale = d3Scale.scaleOrdinal(d3ScaleChromatic.schemePaired) // color list
let colorNumber = 0
let size: Function // function to generate size
let gKey = 0

function initColor(d: Mdata, c?: string) { // Initialize color
  let color
  if (d.id !== '0') {
    color = c || colorScale(`${colorNumber += 1}`)
    d.color = color
  }
  const { children, _children } = d
  if (children) {
    for (let i = 0; i < children.length; i += 1) {
      initColor(children[i], color)
    }
  }
  if (_children) {
    for (let i = 0; i < _children.length; i += 1) {
      initColor(_children[i], color)
    }
  }
}

function initSize(d: Mdata) { // Initialize size
  d.size = size(d.name, d.id === '0')
  const { children, _children } = d
  if (children) {
    for (let i = 0; i < children.length; i += 1) {
      initSize(children[i])
    }
  }
  if (_children) {
    for (let i = 0; i < _children.length; i += 1) {
      initSize(_children[i])
    }
  }
}

function _getSource(d: Mdata) { // return source data
  const { children, _children } = d
  const nd: Data = { name: d.name }
  nd.left = d.left
  if (children) {
    const { length } = children
    nd.children = new Array(length)
    for (let i = 0; i < length; i++) {
      nd.children[i] = _getSource(children[i])
    }
  }
  if (_children) {
    const { length } = _children
    nd._children = new Array(length)
    for (let i = 0; i < length; i++) {
      nd._children[i] = _getSource(_children[i])
    }
  }
  return nd
}

function initId(d: Mdata, id = '0') { // Initialize the unique identifier: to be optimized
  d.id = id
  d.gKey = d.gKey || (gKey += 1)
  const { children, _children } = d

  if (children?.length && _children?.length) {
    console.error('[Mindmap warn]: Error in data: data.children and data._children cannot contain data at the same time')
  } else {
    if (children) {
      for (let i = 0; i < children.length;) {
        if (children[i].id === 'del') {
          children.splice(i, 1)
        } else {
          initId(children[i], `${id}-${i}`)
          i += 1
        }
      }
    }
    if (_children) {
      for (let i = 0; i < _children.length;) {
        if (_children[i].id === 'del') {
          _children.splice(i, 1)
        } else {
          initId(_children[i], `${id}-${i}`)
          i += 1
        }
      }
    }
  }
}

function initLeft(d: Mdata, left = false) {
  d.left = left
  const { children, _children } = d
  if (children) {
    for (let i = 0; i < children.length; i += 1) {
      initLeft(children[i], d.left)
    }
  }
  if (_children) {
    for (let i = 0; i < _children.length; i += 1) {
      initLeft(_children[i], d.left)
    }
  }
}

class ImData {
  data: Mdata
  constructor(d: Data, fn: Function) {
    size = fn
    this.data = JSON.parse(JSON.stringify(d))
    initId(this.data)
    initColor(this.data)
    initSize(this.data)

    this.data.left = false
    const { children, _children } = this.data
    if (children) {
      for (let i = 0; i < children.length; i += 1) {
        initLeft(children[i], children[i].left)
      }
    }
    if (_children) {
      for (let i = 0; i < _children.length; i += 1) {
        initLeft(_children[i], _children[i].left)
      }
    }
  }

  getSource(id = '0') {
    const d = this.find(id)
    return d ? _getSource(d) : { name: '' }
  }

  resize(id = '0') { // update size
    const d = this.find(id)
    if (d) {
      initSize(d)
    }
  }

  find(id: string) { // Find data by id
    const array = id.split('-').map(n => ~~n)
    let data = this.data
    for (let i = 1; i < array.length; i++) {
      if (data && data.children) {
        data = data.children[array[i]]
      } else { // No data matching id
        return null
      }
    }
    return data
  }

  rename(id: string, name: string) { // modify name
    if (id.length > 0) {
      const d = this.find(id)
      if (d) {
        d.name = name
        d.size = size(name, d.id === '0')
      }
      return d
    }
  }

  collapse(id: string | string[]) { // fold
    const arr = Array.isArray(id) ? id : [id]
    for (let i = 0; i < arr.length; i++) {
      const idChild = arr[i]
      const d = this.find(idChild)
      if (d && (!d._children || d._children.length === 0)) {
        d._children = d.children
        d.children = []
      }
    }
  }

  expand(id: string | string[]) { // expand
    const arr = Array.isArray(id) ? id : [id]
    for (let i = 0; i < arr.length; i++) {
      const idChild = arr[i]
      const d = this.find(idChild)
      if (d && (!d.children || d.children.length === 0)) {
        d.children = d._children
        d._children = []
      }
    }
  }

  del(id: string | string[]) { // Delete the data of the specified id
    const arr = Array.isArray(id) ? id : [id]
    let p
    for (let i = 0; i < arr.length; i++) {
      const idChild = arr[i]
      const idArr = idChild.split('-')
      if (idArr.length >= 2) { // have parents
        const delIndex = idArr.pop()
        const parent = this.find(idArr.join('-'))
        if (delIndex && parent) {
          if (parent.children) {
            parent.children[~~delIndex].id = 'del' // Delete when updating id
          }
          if (p === undefined || (p.id.split('-').length > parent.id.split('-').length)) { // find the highest parent
            p = parent
          }
        }
      }
    }
    if (p) {
      initId(p, p.id)
    }
  }

  add(id: string, child: Data) { // add new child node
    if (id.length > 0) {
      const parent = this.find(id)
      if (parent) {
        if ((parent._children?.length || 0) > 0) { // Determine whether to fold, if folded, expand
          parent.children = parent._children
          parent._children = []
        }
        const c: Mdata = JSON.parse(JSON.stringify(child))
        parent.children ? parent.children.push(c) : parent.children = [c]
        initColor(c, parent.color || colorScale(`${colorNumber += 1}`))
        initId(c, `${parent.id}-${parent.children.length - 1}`)
        c.left = parent.left
        initSize(c)
        return c
      }
    }
  }

  insert(id: string, d: Data, i = 0) { // insert new node before (or after)
    if (id.length > 2) {
      const idArr = id.split('-')
      const bId = idArr.pop()
      const pId = idArr.join('-')
      const parent = this.find(pId)
      if (bId && parent) {
        const c: Mdata = JSON.parse(JSON.stringify(d))
        const pChildren = parent.children
        if (pChildren) {
          pChildren.splice(~~bId + i, 0, c)
          c.left = pChildren[~~bId].left
        }
        initColor(c, parent.color || colorScale(`${colorNumber += 1}`))
        initId(parent, parent.id)
        initSize(c)
        return c
      }
    }
  }

  move(delId: string, insertId?: string, i = 0) { // Nodes move on the same level
    if (delId.length > 2) {
      if (!insertId) { // switch left and right
        const del = this.find(delId)
        if (del) {
          initLeft(del, !del.left)
        }
      } else if (insertId.length > 2) {
        const insert = this.find(insertId)
        const idArr = delId.split('-')
        const delIndexS = idArr.pop()
        const pId = idArr.join('-')
        const parent = this.find(pId)
        const insertIndexS = insertId.split('-').pop()

        if (delIndexS && insertIndexS && insert && parent && parent.children) {
          const delIndex = ~~delIndexS
          let insertIndex = ~~insertIndexS
          // The sequence number of insertion may be changed when deleting
          if (delIndex < insertIndex) {
            insertIndex -= 1
          }
          const del = parent.children.splice(delIndex, 1)[0]
          if (del.left !== insert.left) { // switch left and right
            initLeft(del, insert.left)
          }
          parent.children.splice(insertIndex + i, 0, del)
          initId(parent, parent.id)
        }
      }
    }
  }

  reparent(parentId: string, delId: string) { // Nodes move to other layers
    if (delId.length > 2 && parentId.length > 0 && parentId !== delId) {
      const np = this.find(parentId)
      const idArr = delId.split('-')
      const delIndex = idArr.pop()
      const delParentId = idArr.join('-')
      const delParent = this.find(delParentId)
      if (delIndex && delParent && np) {
        const del = delParent.children?.splice(~~delIndex, 1)[0] // delete
        if (del) {
          (np.children?.length || 0) > 0 ? np.children?.push(del)
            : ((np._children?.length || 0) > 0 ? np._children?.push(del) : np.children = [del])

          initColor(del, parentId === '0' ? colorScale(`${colorNumber += 1}`) : np.color)
          initLeft(del, parentId === '0' ? del.left : np.left)
          initId(np, np.id)
          initId(delParent, delParent.id)
        }
      }
    }
  }
}

export default ImData
