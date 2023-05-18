<img src="./public/mindmap.jpg" width="300"/>

# Mind map Vue2 component ![npm](https://img.shields.io/npm/v/@hellowuxin/mindmap) ![npm](https://img.shields.io/npm/dm/@hellowuxin/mindmap)

> A mind map Vue component inspired by [MindNode](https://mindnode.com), based on d3.js  
> The currently implemented functions include basic editing, dragging, zooming, undoing, context menu, folding...

## recent update

> The project will basically no longer be maintained  
> Currently developing Vue3, d3v6 version [mind map component] (https://github.com/hellowuxin/vue3-mindmap), welcome to support

## Install

```sh
npm install @hellowuxin/mindmap
```

## PROPS

| Name        | Type   | Default   | Description          |
| ---         | ---    | ---       | ---                  |
| v-model     | Array  | undefined | Set mind map data        |
| width       | Number | 100%      | Set component width           |
| height      | Number | undefined | Set component height           |
| xSpacing    | Number | 80        | Set the horizontal interval of nodes        |
| ySpacing    | Number | 20        | Set the vertical interval of nodes        |
| strokeWidth | Number | 4         | Set the width of the line          |
| draggable   | Boolean| true      | Set whether the node can be dragged      |
| gps         | Boolean| true      | Whether to display the center button        |
| fitView     | Boolean| true      | Whether to show the zoom button        |
| showNodeAdd | Boolean| true      | Whether to display the add node button     |
| keyboard    | Boolean| true      | Whether to respond to keyboard events        |
| contextMenu | Boolean| true      | Whether to respond to the right-click menu        |
| zoomable    | Boolean| true      | Can zoom and drag        |
| showUndo    | Boolean| true      | Whether to display the undo redo button     |
| download    | Boolean| true      | Whether to display the download button        |

## EVENTS

| Name           | arguments | Description                    |
| ---            | ---       | ---                            |
| updateNodeName | data, id  | When updating the node name, pass in the node data and node id |
| click          | data, id  | When a node is clicked, the node data and node id are passed in    |

## Example

```html
<template>
  <mindmap v-model="data"></mindmap>
</template>

<script>
import mindmap from '@hellowuxin/mindmap'

export default {
  components: { mindmap },
  data: () => ({
    data: [{
      "name":"How to learn D3",
      "children": [
        {
          "name":"Preliminary knowledge",
          "children": [
            { "name":"HTML & CSS" },
            { "name":"JavaScript" },
            ...
          ]
        },
        {
          "name":"Install",
          "_children": [
            { "name": "collapse node" }
          ]
        },
        {
          "name":"Advanced",
          "left": true
        },
        ...
      ]
    }]
  })
}
</script>
```

## Keyboard Events

<kbd>⇥ tab</kbd>、<kbd>⏎ enter</kbd>、<kbd>⌫ backspace</kbd>、<kbd>⌘ cmd</kbd>+<kbd>z</kbd>、<kbd>⌘ cmd</kbd>+<kbd>y</kbd>

## Interactive Logic

**Mouse**：space + left Click to move, right click Menu, ctrl + scroll wheel to zoom, left click to Select

**Touchpad**：Two-finger scrolling, two-finger menu, two-finger pinch-to-zoom, one-finger selection

## to be solved

- [ ] Export to multiple formats
- [ ] Set the width and height of the node
- [ ] multiple root nodes
- [ ] ...
