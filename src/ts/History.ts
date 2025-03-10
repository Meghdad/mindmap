class History {
  maxSnapshots: number
  snapshots: Array<Mdata>
  cursor: number
  constructor(maxSnapshots = 20) {
    this.maxSnapshots = maxSnapshots
    this.snapshots = []
    this.cursor = -1
  }

  get canUndo() { return this.cursor > 0 }
  get canClear() { return this.snapshots.length >= 0 }
  get canRedo() { return this.snapshots.length > this.cursor + 1 }

  record(snapshot: Mdata) { // record data snapshot
    while (this.cursor < this.snapshots.length - 1) { // remove old branch
      this.snapshots.pop()
    }
    this.snapshots.push(snapshot)
    // Ensuring that the number of history records is limited
    if (this.snapshots.length > this.maxSnapshots) { this.snapshots.shift() }
    this.cursor = this.snapshots.length - 1
  }

  undo() {
    if (this.canUndo) {
      this.cursor -= 1
      return this.snapshots[this.cursor]
    }
    return null
  }

  redo() {
    if (this.canRedo) {
      this.cursor += 1
      return this.snapshots[this.cursor]
    }
    return null
  }

  move(cursor: number) {
    if (this.snapshots.length > cursor) {
      this.cursor = cursor
      return this.snapshots[this.cursor]
    }
  }

  clear() {
    this.cursor = -1
    this.snapshots = []
  }
}

export default History
